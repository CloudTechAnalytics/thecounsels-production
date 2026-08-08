-- Self-Service SaaS Onboarding — Part A/B backend.
--
-- Adds a second, parallel path to organization creation alongside the
-- existing platform-admin-only create_organization() RPC: register_organization(),
-- callable by any authenticated user with no existing membership, used by the
-- new /onboarding wizard. create_organization() itself is untouched by this
-- migration — both paths coexist.

-- 1. organization_type — customer (default, self-service + normal manual
--    creation) / demo / internal (Platform Admin only, see migration 0052).
alter table public.organizations
  add column organization_type text not null default 'customer'
    check (organization_type in ('customer', 'demo', 'internal'));

-- 2. Per-plan trial length — null means "this plan has no self-service trial".
alter table public.plans
  add column trial_duration_days integer;

-- 3. Singleton registration settings — the Platform-Console-configurable
--    knobs so trial length/plan/future price are never hardcoded in the app.
create table public.registration_settings (
  id boolean primary key default true check (id),
  trial_enabled boolean not null default true,
  trial_duration_days integer not null default 90,
  trial_plan_id uuid references public.plans(id),
  trial_future_price numeric(12, 2),
  updated_at timestamptz not null default now()
);

create trigger trg_registration_settings_updated_at
  before update on public.registration_settings
  for each row execute function public.set_updated_at();

alter table public.registration_settings enable row level security;

-- Readable by anyone signed in (the onboarding plan step needs it before the
-- user has any org/membership to key permissions off); writes are platform-
-- admin only, same shape as plans_write_platform.
create policy "registration_settings_select" on public.registration_settings
  for select using (true);

create policy "registration_settings_write" on public.registration_settings
  for update using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 4. Seed the "Early Access" plan (3 months free, then ₦15,000/month) and
--    point registration_settings at it. Existing 'professional' plan (used
--    by the Platform Admin's manual-creation dialog) is untouched.
insert into public.plans (key, name, description, currency, price_monthly, price_yearly, max_users, trial_duration_days, highlights, is_active, sort_order)
values (
  'early_access',
  'Early Access',
  'Full access during early access — no card required to start.',
  'NGN', 15000, 150000, null, 90,
  array['3 months free', 'Then ₦15,000/month', 'Full product access, no crippled trial'],
  true, 0
)
on conflict (key) do nothing;

insert into public.registration_settings (id, trial_enabled, trial_duration_days, trial_plan_id, trial_future_price)
select true, true, 90, p.id, p.price_monthly
from public.plans p where p.key = 'early_access'
on conflict (id) do update set trial_plan_id = excluded.trial_plan_id, trial_future_price = excluded.trial_future_price;

-- 5. register_organization() — the self-service org-creation RPC. Parallel
--    to create_organization() (platform-admin-only), never replaces it.
--    Single PL/pgSQL body = one transaction: organizations + subscriptions +
--    memberships all commit together or none do.
create or replace function public.register_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_country text default null,
  p_timezone text default null,
  p_website text default null,
  p_industry text default null,
  p_user_count text default null,
  p_practice_areas text[] default null
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
  v_role_id uuid;
  v_settings public.registration_settings;
  v_plan public.plans;
  v_trial_days integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Idempotency: a double-submitted or retried call must not create a
  -- second organization for the same user.
  if exists (select 1 from public.memberships where user_id = v_uid and status = 'active') then
    raise exception 'You already belong to an organization' using errcode = 'P0001';
  end if;

  -- Duplicate firm display names are explicitly allowed — only the internal
  -- slug needs to be unique, with a random-suffix fallback on collision.
  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'firm'; end if;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  select * into v_settings from public.registration_settings where id = true;
  if v_settings.trial_plan_id is not null then
    select * into v_plan from public.plans where id = v_settings.trial_plan_id;
  end if;
  if v_plan.id is null then
    select * into v_plan from public.plans where key = 'early_access';
  end if;
  v_trial_days := coalesce(v_settings.trial_duration_days, v_plan.trial_duration_days, 90);

  insert into public.organizations (name, slug, legal_name, status, timezone, website, industry, organization_type, settings)
  values (
    p_name, v_slug, nullif(p_legal_name, ''), 'trial', coalesce(nullif(p_timezone, ''), 'UTC'),
    nullif(p_website, ''), nullif(p_industry, ''), 'customer',
    jsonb_build_object('country', p_country, 'user_count_band', p_user_count, 'practice_areas', coalesce(p_practice_areas, '{}'))
  )
  returning * into org;

  insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
  values (
    org.id, v_plan.id, 'trialing', 'monthly', coalesce(v_plan.max_users, 5),
    now() + (v_trial_days || ' days')::interval,
    now() + (v_trial_days || ' days')::interval
  );

  select id into v_role_id from public.roles where key = 'managing_partner';
  insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
  values (org.id, v_uid, v_role_id, 'active', true, now());

  update public.profiles set default_organization_id = org.id where id = v_uid;

  perform public.log_audit(
    org.id, 'organization.self_registered', 'organization', org.id,
    'Organization self-registered', jsonb_build_object('name', p_name), false
  );

  return org;
end;
$$;

grant execute on function public.register_organization(text, text, text, text, text, text, text, text, text[]) to authenticated;
