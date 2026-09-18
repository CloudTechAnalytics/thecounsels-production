-- ============================================================================
-- Migration 0167 — Manual payment flow, billing_country, multi-org signup.
--
-- Three real, distinct concepts kept separate per the product decision:
-- country (where the org is located) vs billing_currency (what they're
-- charged in — NGN today, everywhere) vs payment_method (how they pay —
-- Paystack or manual/contact-sales). None of these should determine the
-- other two.
--
-- Manual payment is a genuine fallback for a country Paystack can't
-- currently settle for, or a card that fails — never a fake successful
-- payment: it lands the subscription on payment_status='pending' and
-- status='awaiting_payment' (new enum value), fully blocked by
-- RequireActiveSubscription same as expired/suspended/paused, until a
-- platform admin explicitly verifies and activates it.
-- ============================================================================

-- New enum value MUST be added and committed before any DML in this same
-- migration can reference it directly — safe here because everything below
-- that "uses" it does so only inside function BODIES (parsed, not executed,
-- at CREATE FUNCTION time), never as a literal in an UPDATE/INSERT run now.
alter type public.subscription_status add value if not exists 'awaiting_payment';

alter table public.subscriptions
  add column if not exists billing_country text,
  add column if not exists payment_method text not null default 'paystack'
    check (payment_method in ('paystack', 'manual')),
  add column if not exists payment_status text not null default 'verified'
    check (payment_status in ('pending', 'verified', 'rejected')),
  add column if not exists provider text not null default 'paystack';

-- ----------------------------------------------------------------------------
-- Real multi-org support: previously ANY active membership anywhere blocked
-- registering a second organization — not a bug, a deliberate v1 rule, but
-- one the product now explicitly wants removed (john@gmail.com should be
-- able to own both "Law Castle" and "John & Partners", fully isolated from
-- each other, same as any other two organizations). CREATE OR REPLACE with
-- an unchanged signature — no DROP needed, this isn't an overload change.
-- ----------------------------------------------------------------------------
create or replace function public.register_organization(
  p_name text,
  p_slug text,
  p_plan_id uuid,
  p_legal_name text default null,
  p_country text default null,
  p_timezone text default null,
  p_website text default null,
  p_industry text default null,
  p_user_count text default null,
  p_practice_areas text[] default null,
  p_registrant_role text default 'managing_partner',
  p_currency text default 'NGN'
)
returns public.organizations
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  org public.organizations;
  v_uid uuid := auth.uid();
  v_slug text;
  v_base_slug text;
  v_suffix int := 1;
  v_role_id uuid;
  v_role_key public.role_key;
  v_plan public.plans;
  v_trial_plan public.plans;
  v_settings public.registration_settings;
  v_trial_days integer;
  v_price public.plan_prices;
  v_amount numeric;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- (multi-org block intentionally removed — see migration header)

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if v_plan.id is null then
    raise exception 'Select a valid plan' using errcode = 'P0001';
  end if;

  select * into v_settings from public.registration_settings where id = true;
  select * into v_trial_plan from public.plans where id = v_settings.trial_plan_id and is_active;
  if v_trial_plan.id is null then
    select * into v_trial_plan from public.plans where key = 'professional' and is_active;
  end if;
  if v_trial_plan.id is null then
    v_trial_plan := v_plan;
  end if;
  v_trial_days := coalesce(v_settings.trial_duration_days, v_trial_plan.trial_duration_days, 30);

  v_base_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  if v_base_slug = '' then v_base_slug := 'firm'; end if;

  v_slug := v_base_slug;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.organizations (name, slug, legal_name, status, timezone, website, industry, organization_type, settings)
  values (
    p_name, v_slug, nullif(p_legal_name, ''), 'trial', coalesce(nullif(p_timezone, ''), 'UTC'),
    nullif(p_website, ''), nullif(p_industry, ''), 'customer',
    jsonb_build_object('country', p_country, 'user_count_band', p_user_count, 'practice_areas', coalesce(p_practice_areas, '{}'))
  )
  returning * into org;

  select * into v_price from public.plan_prices where plan_id = v_trial_plan.id and currency = coalesce(nullif(p_currency, ''), 'NGN');
  if v_price.id is not null then
    v_amount := v_price.price_monthly;
  else
    v_amount := v_trial_plan.price_monthly;
  end if;

  insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, amount, currency, billing_country, trial_ends_at, current_period_end)
  values (
    org.id, v_trial_plan.id, 'trialing', 'monthly', coalesce(v_trial_plan.max_users, 5), v_amount,
    coalesce(nullif(p_currency, ''), v_trial_plan.currency, 'NGN'),
    nullif(p_country, ''),
    now() + (v_trial_days || ' days')::interval,
    now() + (v_trial_days || ' days')::interval
  );

  begin
    v_role_key := p_registrant_role::public.role_key;
  exception when invalid_text_representation then
    v_role_key := null;
  end;
  if v_role_key is null or not exists (select 1 from public.roles where key = v_role_key) then
    v_role_key := 'managing_partner';
  end if;
  select id into v_role_id from public.roles where key = v_role_key;

  insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
  values (org.id, v_uid, v_role_id, 'active', true, now());

  update public.profiles set default_organization_id = coalesce(default_organization_id, org.id) where id = v_uid;

  perform public.log_audit(
    org.id, 'organization.self_registered', 'organization', org.id,
    'Organization self-registered',
    jsonb_build_object('name', p_name, 'intended_plan', v_plan.key, 'trial_plan', v_trial_plan.key, 'registrant_role', v_role_key, 'currency', coalesce(nullif(p_currency, ''), 'NGN')),
    false
  );

  return org;
end;
$$;

-- ----------------------------------------------------------------------------
-- request_manual_payment() — the "Pay manually / Contact us" path. Never
-- marks anything paid; only moves the subscription to a real, honest
-- pending state a platform admin has to act on. Amount/currency resolved
-- the same plan_prices-first, legacy-column-fallback way paystack-init-
-- transaction already does — no hardcoded prices here either.
-- ----------------------------------------------------------------------------
create or replace function public.request_manual_payment(
  p_org uuid,
  p_plan_id uuid,
  p_currency text default 'NGN',
  p_billing_cycle public.billing_cycle default 'monthly',
  p_country text default null
)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan public.plans;
  v_price public.plan_prices;
  v_amount numeric;
  v_currency text := coalesce(nullif(p_currency, ''), 'NGN');
  sub public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not authorized to manage billing for this organization' using errcode = '42501';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if v_plan.id is null or v_plan.is_custom then
    raise exception 'Select a valid plan' using errcode = 'P0001';
  end if;

  select * into v_price from public.plan_prices where plan_id = p_plan_id and currency = v_currency;
  if v_price.id is not null then
    v_amount := case p_billing_cycle
      when 'quarterly' then coalesce(v_price.price_quarterly, v_price.price_monthly * 3)
      when 'yearly' then v_price.price_yearly
      else v_price.price_monthly
    end;
  elsif v_currency = coalesce(v_plan.currency, 'NGN') then
    v_amount := case p_billing_cycle
      when 'quarterly' then coalesce(v_plan.price_quarterly, v_plan.price_monthly * 3)
      when 'yearly' then v_plan.price_yearly
      else v_plan.price_monthly
    end;
  else
    raise exception 'This plan has no % price set yet — contact support.', v_currency using errcode = 'P0001';
  end if;

  update public.subscriptions
  set plan_id = p_plan_id,
      billing_cycle = p_billing_cycle,
      amount = v_amount,
      currency = v_currency,
      billing_country = coalesce(nullif(p_country, ''), billing_country),
      payment_method = 'manual',
      payment_status = 'pending',
      provider = 'manual',
      status = 'awaiting_payment'
  where organization_id = p_org
  returning * into sub;

  if sub.id is null then
    raise exception 'No subscription found for this organization' using errcode = 'P0002';
  end if;

  perform public.log_audit(
    p_org, 'subscription.manual_payment_requested', 'subscription', sub.id,
    format('Requested manual payment for %s plan — %s %s', v_plan.name, v_currency, v_amount),
    jsonb_build_object('plan', v_plan.key, 'currency', v_currency, 'amount', v_amount, 'billing_cycle', p_billing_cycle, 'country', p_country),
    false
  );

  return sub;
end;
$$;

grant execute on function public.request_manual_payment(uuid, uuid, text, public.billing_cycle, text) to authenticated;

-- ----------------------------------------------------------------------------
-- platform_review_manual_payment() — the admin side. Requires an explicit
-- action; never auto-activates just because "manual" was chosen. Rejecting
-- leaves the org blocked (still awaiting_payment) but marks payment_status
-- so the admin console shows it was actually reviewed, not just untouched.
-- ----------------------------------------------------------------------------
create or replace function public.platform_review_manual_payment(p_subscription_id uuid, p_action text)
returns public.subscriptions
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  sub public.subscriptions;
  v_period interval;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can review manual payments' using errcode = '42501';
  end if;
  if p_action not in ('verify_and_activate', 'reject') then
    raise exception 'Unknown action: %', p_action using errcode = 'P0001';
  end if;

  select * into sub from public.subscriptions where id = p_subscription_id;
  if sub.id is null then
    raise exception 'Subscription not found' using errcode = 'P0002';
  end if;

  if p_action = 'verify_and_activate' then
    v_period := case sub.billing_cycle when 'quarterly' then interval '3 months' when 'yearly' then interval '1 year' else interval '1 month' end;
    update public.subscriptions
    set payment_status = 'verified',
        status = 'active',
        last_payment_at = now(),
        current_period_end = now() + v_period,
        next_billing_date = now() + v_period
    where id = p_subscription_id
    returning * into sub;

    update public.organizations set status = 'active' where id = sub.organization_id and status <> 'active';

    perform public.log_audit(
      sub.organization_id, 'subscription.manual_payment_verified', 'subscription', sub.id,
      'Manual payment verified — subscription activated', '{}'::jsonb, true
    );
  else
    update public.subscriptions
    set payment_status = 'rejected'
    where id = p_subscription_id
    returning * into sub;

    perform public.log_audit(
      sub.organization_id, 'subscription.manual_payment_rejected', 'subscription', sub.id,
      'Manual payment rejected', '{}'::jsonb, true
    );
  end if;

  return sub;
end;
$$;

grant execute on function public.platform_review_manual_payment(uuid, text) to authenticated;
