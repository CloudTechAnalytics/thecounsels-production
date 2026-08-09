-- Commercial Model Overhaul, Part E — trial lifecycle automation.
--
-- Per an explicit decision this round: date-triggered transitions (trial
-- reminders, trial -> expired, scheduled downgrades taking effect, past_due
-- -> suspended) run on a real daily pg_cron job, not a lazy on-load check,
-- so they fire exactly on schedule regardless of whether anyone logs in.

create extension if not exists pg_cron;

-- notify_org_members() — same fan-out shape as notify_matter_team() (0047),
-- looping every active membership instead of a matter's team. No actor
-- (these are system-generated).
create or replace function public.notify_org_members(
  p_org uuid,
  p_category public.notification_category,
  p_action text,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select user_id from public.memberships where organization_id = p_org and status = 'active'
  loop
    perform public.notify_user(p_org, recipient, null, p_category, p_action, 'subscription', p_org, p_title, p_priority);
  end loop;
end;
$$;

-- run_daily_subscription_checks() — the single scheduled job covering every
-- date-triggered subscription transition:
--   1. Trial reminders at 30/14/7/3/1 days remaining (dedup via
--      last_trial_reminder_days, so re-running the job the same day, or
--      catching up after downtime, never double-notifies).
--   2. Trial -> expired once trial_ends_at has passed.
--   3. Scheduled downgrades (Part F) taking effect on their billing date.
--   4. past_due -> suspended after a 7-day grace window.
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
    select s.id, s.organization_id, p.name as plan_name, s.last_trial_reminder_days,
           ceil(extract(epoch from (s.trial_ends_at - now())) / 86400)::int as days_left
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status = 'trialing' and s.trial_ends_at is not null
  loop
    if r.days_left in (30, 14, 7, 3, 1) and coalesce(r.last_trial_reminder_days, 999) > r.days_left then
      perform public.notify_org_members(
        r.organization_id, 'billing',
        case r.days_left when 30 then 'trial_started' when 1 then 'trial_ending_tomorrow' else 'trial_reminder' end,
        case r.days_left
          when 30 then format('Your %s free trial has started', r.plan_name)
          when 1 then 'Your free trial ends tomorrow.'
          else format('Your free trial ends in %s days.', r.days_left)
        end,
        case when r.days_left <= 3 then 'urgent' when r.days_left <= 7 then 'warning' else 'reminder' end
      );
      update public.subscriptions set last_trial_reminder_days = r.days_left where id = r.id;
    elsif r.days_left < 0 then
      update public.subscriptions set status = 'expired' where id = r.id;
      perform public.notify_org_members(
        r.organization_id, 'billing', 'trial_expired',
        'Your free trial has ended. Choose a plan to continue using The Counsel.', 'urgent'
      );
    end if;
  end loop;

  -- Scheduled downgrades taking effect on their billing date.
  update public.subscriptions
  set plan_id = scheduled_plan_id, scheduled_plan_id = null, scheduled_change_at = null
  where scheduled_change_at is not null and scheduled_change_at <= now();

  -- past_due -> suspended after a 7-day grace window.
  update public.subscriptions
  set status = 'suspended'
  where status = 'past_due' and updated_at < now() - interval '7 days';
end;
$$;

select cron.schedule('daily-subscription-checks', '0 6 * * *', $$select public.run_daily_subscription_checks();$$);
