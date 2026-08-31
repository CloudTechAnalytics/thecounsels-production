-- ============================================================================
-- Migration 0161 — Multi-currency plan pricing. Real product decision: stop
-- assuming every prospect is Nigerian. Paystack itself already supports
-- NGN, GHS, ZAR, KES and USD natively — the app just never gave it anything
-- but NGN to work with. plans.currency/price_monthly/price_quarterly/
-- price_yearly stay as-is (now read as the NGN row's legacy mirror, kept
-- for any code path not yet updated) — real multi-currency pricing lives
-- in this new plan_prices table instead: one row per (plan, currency).
--
-- Deliberately NOT auto-generating GHS/ZAR/KES/USD prices from an FX
-- conversion of the NGN prices — only backfilling the real, already-true
-- NGN row. Getting other currencies' actual prices right is a pricing
-- decision, not something to guess at silently; the new Plan Editor UI
-- (frontend) is where those get set deliberately.
-- ============================================================================

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  currency text not null,
  price_monthly numeric not null default 0,
  price_quarterly numeric,
  price_yearly numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, currency)
);

alter table public.plan_prices enable row level security;

-- Same posture as plans itself — pricing has to be visible to someone who
-- isn't signed in yet (the onboarding plan-selection step), so SELECT is
-- open; only a platform admin can write.
create policy plan_prices_select on public.plan_prices for select using (true);
create policy plan_prices_write on public.plan_prices for all
  using (is_platform_admin()) with check (is_platform_admin());

create trigger trg_plan_prices_updated_at
  before update on public.plan_prices
  for each row execute function public.set_updated_at();

insert into public.plan_prices (plan_id, currency, price_monthly, price_quarterly, price_yearly)
select id, currency, price_monthly, price_quarterly, price_yearly from public.plans
on conflict (plan_id, currency) do nothing;

-- ----------------------------------------------------------------------------
-- register_organization() gains p_currency — looks up the matching
-- plan_prices row for the trial plan; falls back to the trial plan's own
-- legacy NGN-only columns if no plan_prices row exists for that currency
-- yet (defensive — never breaks a real signup over a pricing-data gap),
-- and finally to NGN outright if even that's missing.
-- ----------------------------------------------------------------------------
drop function if exists public.register_organization(text, text, uuid, text, text, text, text, text, text, text[], text);

create function public.register_organization(
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
set search_path = public
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

  if exists (select 1 from public.memberships where user_id = v_uid and status = 'active') then
    raise exception 'You already belong to an organization' using errcode = 'P0001';
  end if;

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

  -- Real pricing for the chosen currency if it exists; otherwise fall back
  -- to the trial plan's own legacy columns (always NGN today) rather than
  -- ever leaving amount/currency silently wrong or null.
  select * into v_price from public.plan_prices where plan_id = v_trial_plan.id and currency = coalesce(nullif(p_currency, ''), 'NGN');
  if v_price.id is not null then
    v_amount := v_price.price_monthly;
  else
    v_amount := v_trial_plan.price_monthly;
  end if;

  insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, amount, currency, trial_ends_at, current_period_end)
  values (
    org.id, v_trial_plan.id, 'trialing', 'monthly', coalesce(v_trial_plan.max_users, 5), v_amount,
    coalesce(nullif(p_currency, ''), v_trial_plan.currency, 'NGN'),
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

  update public.profiles set default_organization_id = org.id where id = v_uid;

  perform public.log_audit(
    org.id, 'organization.self_registered', 'organization', org.id,
    'Organization self-registered',
    jsonb_build_object('name', p_name, 'intended_plan', v_plan.key, 'trial_plan', v_trial_plan.key, 'registrant_role', v_role_key, 'currency', coalesce(nullif(p_currency, ''), 'NGN')),
    false
  );

  return org;
end;
$$;
