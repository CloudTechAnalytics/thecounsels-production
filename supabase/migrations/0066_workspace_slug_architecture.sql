-- ============================================================================
-- Migration 0065 — Workspace slug architecture.
--
-- Most of this already existed: organizations.slug has been `citext not
-- null unique` since migration 0001 (every organization, including every
-- existing one, already has a slug — nothing to backfill), register_
-- organization() already generates one from the firm's short name and
-- already guarantees uniqueness. What's added here:
--   1. Basic (was Starter) — display-name rename only, key stays 'starter'.
--   2. Collision suffixing switches from a random 4-char suffix to
--      sequential -2/-3/... matching the spec's own example, and the
--      resolution now prefers slug (not name) as the base string.
--   3. get_organization_by_slug() — a narrow, PUBLIC (anon-callable) RPC
--      returning only {id, name, slug, logo_url} for one purpose: showing
--      "Sign in to {firm}" on a workspace-branded login route. It is NOT a
--      data-access grant — every other table's RLS is completely untouched,
--      still scoped by organization_id exactly as before. See src/app/router.tsx's
--      /w/:slug route for the only place this is called from.
--   4. update_organization_slug() — lets a Managing Partner change their
--      own workspace's slug from Firm Settings, with real uniqueness
--      validation and a clean error instead of a raw constraint-violation
--      message. Never touches organizations.id.
-- ============================================================================

update public.plans set name = 'Basic' where key = 'starter';

-- ----------------------------------------------------------------------------
-- register_organization: sequential collision suffix (lawcastle -> lawcastle-2
-- -> lawcastle-3 ...) instead of a random hex tail. Everything else about
-- this function (plan-aware trial creation, owner membership, atomicity) is
-- unchanged from 0054.
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
  v_base_slug text;
  v_suffix int := 1;
  v_role_id uuid;
  v_plan public.plans;
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
  v_trial_days := coalesce(v_plan.trial_duration_days, 30);

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
    org.id, v_plan.id, 'trialing', 'monthly', coalesce(v_plan.max_users, 5), v_plan.price_monthly, v_plan.currency,
    now() + (v_trial_days || ' days')::interval,
    now() + (v_trial_days || ' days')::interval
  );

  select id into v_role_id from public.roles where key = 'managing_partner';
  insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
  values (org.id, v_uid, v_role_id, 'active', true, now());

  update public.profiles set default_organization_id = org.id where id = v_uid;

  perform public.log_audit(
    org.id, 'organization.self_registered', 'organization', org.id,
    'Organization self-registered', jsonb_build_object('name', p_name, 'plan', v_plan.key), false
  );

  return org;
end;
$$;

-- ----------------------------------------------------------------------------
-- get_organization_by_slug — public, deliberately minimal. Anonymous
-- visitors to /w/:slug need to see the firm's name (and logo) before they've
-- authenticated at all; this is the one narrow, explicit exception to "every
-- read goes through membership-scoped RLS," and it exposes nothing beyond
-- what's already effectively public (a firm's own display name/branding).
-- Every other organization column, and every other table, stays exactly as
-- RLS-gated as before.
-- ----------------------------------------------------------------------------
create or replace function public.get_organization_by_slug(p_slug text)
returns table (id uuid, name text, slug citext, logo_url text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.slug, o.logo_url
  from public.organizations o
  where o.slug = lower(trim(p_slug)) and o.deleted_at is null;
$$;

grant execute on function public.get_organization_by_slug(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- update_organization_slug — Managing Partner / org-admin only. Normalizes
-- the same way registration does, validates uniqueness with a clean error
-- (rather than a raw unique-constraint-violation message), and only ever
-- touches the slug column — organization_id and every other column,
-- relationship and RLS grant are completely unaffected.
-- ----------------------------------------------------------------------------
create or replace function public.update_organization_slug(p_org uuid, p_slug text)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  org public.organizations;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Only your Managing Partner can change the workspace address' using errcode = '42501';
  end if;

  v_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' or length(v_slug) < 2 then
    raise exception 'Enter a workspace address with at least 2 characters' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.organizations where slug = v_slug and id <> p_org) then
    raise exception 'That workspace address is already taken — try another' using errcode = 'P0001';
  end if;

  update public.organizations set slug = v_slug where id = p_org returning * into org;

  perform public.log_audit(
    p_org, 'organization.slug_changed', 'organization', p_org,
    'Workspace address changed to "' || v_slug || '"', '{}'::jsonb, false
  );

  return org;
end;
$$;

grant execute on function public.update_organization_slug(uuid, text) to authenticated;
