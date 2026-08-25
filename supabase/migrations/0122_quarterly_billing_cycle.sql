-- ============================================================================
-- Migration 0122 — Quarterly billing: real plan pricing + checkout support.
--
-- Depends on 0121 having committed first (adds the enum value this uses).
--
-- billing_cycle already existed as a concept end-to-end in the schema, but
-- nothing ever actually offered anything but 'monthly' to a paying org:
-- register_organization() (self-service signup) always inserted 'monthly'
-- with no parameter to change it, and paystack-init-transaction always
-- charged plan.price_monthly regardless of what a subscription's
-- billing_cycle even said. This migration is the schema/RPC half of making
-- quarterly and yearly real, paired with edge function + frontend changes
-- outside this file (paystack-init-transaction now picks the right price
-- column and records the chosen cycle before redirecting to checkout;
-- paystack-webhook already read billing_cycle to compute next_billing_date,
-- it just needed the quarterly branch added).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. plans.price_quarterly — same shape as price_monthly/price_yearly.
--    Backfilled at roughly a 10% discount off 3x monthly, the same spirit as
--    the existing yearly pricing (already ~17% off 12x monthly) — an admin
--    can always retune these from Plans & Pricing afterward.
-- ----------------------------------------------------------------------------
alter table public.plans add column if not exists price_quarterly numeric(12,2);

update public.plans set price_quarterly = round(price_monthly * 3 * 0.9, -3)
where price_quarterly is null and price_monthly is not null;

-- ----------------------------------------------------------------------------
-- 2. subscriptions.scheduled_billing_cycle — the cycle a scheduled downgrade
--    (schedule_plan_downgrade below) should switch to, alongside the plan it
--    already tracks via scheduled_plan_id. Null means "keep the current
--    cycle", same default-preserving shape as scheduled_plan_id itself.
-- ----------------------------------------------------------------------------
alter table public.subscriptions add column if not exists scheduled_billing_cycle public.billing_cycle;

-- ----------------------------------------------------------------------------
-- 3. create_organization — both live overloads get the same quarterly
--    period_end branch (p_billing_cycle was already a real parameter on
--    both; only the date math needed extending).
-- ----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle billing_cycle default 'monthly'::billing_cycle,
  p_owner_user_id uuid default null
)
returns organizations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  org public.organizations;
  owner_role_id uuid;
  resolved_plan_id uuid;
  period_end timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, legal_name, status)
  values (
    p_name,
    lower(p_slug),
    p_legal_name,
    (case when p_trial then 'trial' else 'active' end)::public.org_status
  )
  returning * into org;

  resolved_plan_id := coalesce(p_plan_id, (select id from public.plans where key = 'professional'));

  if p_trial then
    insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
    values (org.id, resolved_plan_id, 'trialing', p_billing_cycle, 5, now() + interval '14 days', now() + interval '14 days');
  else
    period_end := case
      when p_billing_cycle = 'yearly' then now() + interval '1 year'
      when p_billing_cycle = 'quarterly' then now() + interval '3 months'
      else now() + interval '1 month'
    end;
    insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, current_period_end)
    values (org.id, resolved_plan_id, 'active', p_billing_cycle,
            coalesce((select max_users from public.plans where id = resolved_plan_id), 5), period_end);
  end if;

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';
    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial), true);
  return org;
end;
$function$;

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle billing_cycle default 'monthly'::billing_cycle,
  p_owner_user_id uuid default null,
  p_org_type text default 'customer'::text
)
returns organizations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  org public.organizations;
  owner_role_id uuid;
  resolved_plan_id uuid;
  resolved_trial_days integer;
  period_end timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations' using errcode = '42501';
  end if;
  if p_org_type not in ('customer', 'demo', 'internal') then
    raise exception 'Invalid organization type: %', p_org_type;
  end if;

  insert into public.organizations (name, slug, legal_name, status, organization_type)
  values (
    p_name,
    lower(p_slug),
    p_legal_name,
    (case when p_org_type <> 'customer' then 'active' when p_trial then 'trial' else 'active' end)::public.org_status,
    p_org_type
  )
  returning * into org;

  if p_org_type = 'customer' then
    resolved_plan_id := coalesce(p_plan_id, (select id from public.plans where key = 'starter'));

    if p_trial then
      resolved_trial_days := coalesce((select trial_duration_days from public.plans where id = resolved_plan_id), 30);
      insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
      values (
        org.id, resolved_plan_id, 'trialing', p_billing_cycle,
        coalesce((select max_users from public.plans where id = resolved_plan_id), 5),
        now() + (resolved_trial_days || ' days')::interval,
        now() + (resolved_trial_days || ' days')::interval
      );
    else
      period_end := case
        when p_billing_cycle = 'yearly' then now() + interval '1 year'
        when p_billing_cycle = 'quarterly' then now() + interval '3 months'
        else now() + interval '1 month'
      end;
      insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, current_period_end, next_billing_date)
      values (org.id, resolved_plan_id, 'active', p_billing_cycle,
              coalesce((select max_users from public.plans where id = resolved_plan_id), 5), period_end, period_end);
    end if;
  end if;

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';
    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial, 'org_type', p_org_type), true);
  return org;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 4. schedule_plan_downgrade — optionally also schedules a cycle change.
--    p_billing_cycle default null keeps every existing caller (plan-tier-only
--    downgrades) working unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.schedule_plan_downgrade(p_org uuid, p_plan_id uuid, p_billing_cycle billing_cycle default null)
returns subscriptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set scheduled_plan_id = p_plan_id,
      scheduled_billing_cycle = p_billing_cycle,
      scheduled_change_at = coalesce(current_period_end, trial_ends_at, now())
  where organization_id = p_org
  returning * into rec;

  if rec.id is null then
    raise exception 'No subscription found for this organization';
  end if;

  perform public.log_audit(p_org, 'subscription.downgrade_scheduled', 'subscription', rec.id,
    'Plan downgrade scheduled',
    jsonb_build_object('plan_id', p_plan_id, 'billing_cycle', p_billing_cycle, 'effective_at', rec.scheduled_change_at));
  return rec;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 5. cancel_scheduled_downgrade — clears the cycle change too.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_scheduled_downgrade(p_org uuid)
returns subscriptions
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set scheduled_plan_id = null, scheduled_billing_cycle = null, scheduled_change_at = null
  where organization_id = p_org
  returning * into rec;

  return rec;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 6. run_daily_subscription_checks — applies the scheduled cycle change
--    alongside the plan/seats change it already applied. coalesce keeps a
--    downgrade that never specified a cycle change (the overwhelming
--    majority — every pre-existing scheduled downgrade has
--    scheduled_billing_cycle null) landing on its current cycle, unchanged.
-- ----------------------------------------------------------------------------
create or replace function public.run_daily_subscription_checks()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Scheduled downgrades taking effect on their billing date — plan_id,
  -- seats, and (when one was scheduled) billing_cycle all move together.
  update public.subscriptions s
  set plan_id = s.scheduled_plan_id,
      seats = coalesce(p.max_users, 5),
      billing_cycle = coalesce(s.scheduled_billing_cycle, s.billing_cycle),
      scheduled_plan_id = null,
      scheduled_billing_cycle = null,
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
$function$;
