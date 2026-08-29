-- ============================================================================
-- Migration 0155 — Fix 0154's role resolution, caught immediately via live
-- testing before trusting it: public.roles.key is a real Postgres enum
-- (role_key), not text. Comparing it directly to the incoming text
-- parameter (`where key = p_registrant_role`) fails outright —
-- "operator does not exist: role_key = text" — confirmed live, so this
-- would have broken every self-service registration, not just the new
-- role-choice path.
--
-- Fixed with an explicit, exception-guarded cast: an unrecognized string
-- (or null) falls back to managing_partner instead of erroring, same
-- fallback behavior 0154 always intended, just implemented correctly now.
-- Verified live against all 5 real form options plus an invalid value and
-- null before applying this.
-- ============================================================================

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
  p_registrant_role text default 'managing_partner'
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

  insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, amount, currency, trial_ends_at, current_period_end)
  values (
    org.id, v_trial_plan.id, 'trialing', 'monthly', coalesce(v_trial_plan.max_users, 5), v_trial_plan.price_monthly, v_trial_plan.currency,
    now() + (v_trial_days || ' days')::interval,
    now() + (v_trial_days || ' days')::interval
  );

  -- Safe, exception-guarded cast — an unrecognized string or null falls
  -- back to managing_partner instead of erroring the whole registration.
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
    jsonb_build_object('name', p_name, 'intended_plan', v_plan.key, 'trial_plan', v_trial_plan.key, 'registrant_role', v_role_key),
    false
  );

  return org;
end;
$$;
