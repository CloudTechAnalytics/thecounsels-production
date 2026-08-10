-- ============================================================================
-- Migration 0067 — Keep subscriptions.seats in sync with the active plan.
--
-- Found while investigating why a Business-plan org (max_users = 25) still
-- showed "1 of 10 seats used" in Plan & Billing. Root cause: seats was only
-- ever set once, at register_organization() time — nothing updated it again
-- when a subscription later changed plans:
--   - Upgrading via Paystack checkout (paystack-webhook's charge.success
--     handler) only ever wrote plan_id, never seats.
--   - A scheduled downgrade taking effect (run_daily_subscription_checks,
--     migration 0055) only ever wrote plan_id, never seats.
-- Both the seat-limit UI (members-panel.tsx, plan-summary.tsx) and the real
-- enforcement (can_add_member()/memberships_insert RLS, admin-create-user
-- Edge Function — migration 0054) all read subscriptions.seats directly, so
-- a stale value doesn't just look wrong, it actually under- or over-caps how
-- many users an org can add relative to what they're actually paying for.
--
-- Fix has three parts:
--   1. One-time backfill — every existing subscription's seats corrected to
--      match its current plan right now.
--   2. run_daily_subscription_checks() — scheduled downgrades now sync
--      seats to the new plan at the moment they take effect.
--   3. paystack-webhook (Edge Function, redeploy required — see below) —
--      now syncs seats to the plan being paid for on charge.success.
-- ============================================================================

-- 1. One-time backfill. max_users = null (unlimited) correctly produces
--    seats = null, matching how can_add_member()/the UI already treat null
--    as "no limit" — no separate case needed.
update public.subscriptions s
set seats = p.max_users
from public.plans p
where s.plan_id = p.id
  and s.seats is distinct from p.max_users;

-- 2. Scheduled downgrades now sync seats when they take effect.
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

  -- Scheduled downgrades taking effect on their billing date — plan_id AND
  -- seats both move to the new plan together, never just one of them.
  update public.subscriptions s
  set plan_id = s.scheduled_plan_id,
      seats = p.max_users,
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
