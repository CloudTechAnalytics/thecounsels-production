-- ============================================================================
-- Migration 0096 — same bug class as 0095, found while sweeping every
-- notify_user/notify_matter_team/notify_org_members call site for it:
-- run_daily_subscription_checks()'s trial-reminder branch builds the
-- priority argument with
-- `case when r.days_left <= 3 then 'urgent' when r.days_left <= 7 then
-- 'warning' else 'reminder' end` — an unqualified CASE resolves to text,
-- which can't implicitly cast to notification_priority, so
-- notify_org_members(...) fails to resolve every single time this cron
-- tries to send a trial-reminder notification (30/14/7/3/1 days left).
-- This has been silently broken since 0055 first introduced it — it runs
-- on a schedule with no user watching, so nothing ever surfaced it.
--
-- Redefines the LIVE version of the function (0067's, which itself
-- superseded 0055's — this is not a revert, it keeps 0067's seat-sync
-- behavior intact and only adds the missing casts).
-- ============================================================================

create or replace function public.run_daily_subscription_checks()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select s.id, s.organization_id, s.trial_ends_at, s.last_trial_reminder_days, p.name as plan_name,
           extract(day from s.trial_ends_at - now())::int as days_left
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status = 'trialing' and s.trial_ends_at is not null
  loop
    if r.days_left in (30, 14, 7, 3, 1) and coalesce(r.last_trial_reminder_days, 999) > r.days_left then
      perform public.notify_org_members(
        r.organization_id, 'billing'::public.notification_category,
        (case r.days_left when 30 then 'trial_started' when 1 then 'trial_ending_tomorrow' else 'trial_reminder' end)::text,
        (case r.days_left
          when 30 then format('Your %s free trial has started', r.plan_name)
          when 1 then 'Your free trial ends tomorrow.'
          else format('Your free trial ends in %s days.', r.days_left)
        end)::text,
        (case when r.days_left <= 3 then 'urgent' when r.days_left <= 7 then 'warning' else 'reminder' end)::public.notification_priority
      );
      update public.subscriptions set last_trial_reminder_days = r.days_left where id = r.id;
    elsif r.days_left < 0 then
      update public.subscriptions set status = 'expired' where id = r.id;
      perform public.notify_org_members(
        r.organization_id, 'billing'::public.notification_category, 'trial_expired'::text,
        'Your free trial has ended. Choose a plan to continue using The Counsel.'::text, 'urgent'::public.notification_priority
      );
    end if;
  end loop;

  -- Scheduled downgrades taking effect on their billing date — plan_id AND
  -- seats both move to the new plan together, never just one of them.
  update public.subscriptions s
  set plan_id = s.scheduled_plan_id,
      seats = coalesce(p.max_users, 5),
      scheduled_plan_id = null,
      scheduled_change_at = null
  from public.plans p
  where p.id = s.scheduled_plan_id
    and s.scheduled_change_at is not null
    and s.scheduled_change_at <= now();

  -- past_due -> suspended after a 7-day grace window.
  update public.subscriptions
  set status = 'suspended'
  where status = 'past_due' and updated_at < now() - interval '7 days';
end;
$$;
