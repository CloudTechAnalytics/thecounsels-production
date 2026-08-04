-- ============================================================================
-- Migration 0021 — Scope the audit log correctly.
--
-- Problem: every audit_logs row carries an organization_id, including entries
-- for actions the PLATFORM performed *about* an org (creating it, suspending
-- it, deleting it, changing its subscription). Because audit_select only
-- checked organization_id, any org admin could see those platform-initiated
-- entries mixed into their own firm's activity feed — e.g. "organization
-- created" / "organization deleted" showing up for the very org that was
-- created or deleted.
--
-- It also let anyone with org-wide `audit.read` (or org-admin status) see
-- every member's actions with no way for an ordinary member to see just
-- their own — there was no "my own activity" tier, only "all of it" or
-- "none of it".
--
-- Fix:
--   1. Tag platform-initiated rows with is_platform_action = true.
--   2. RLS: platform admins see everything; org members never see
--      is_platform_action rows; every member can always see their own
--      actions (actor_id = auth.uid()); org admins / audit.read holders
--      can see the rest of their org's (non-platform) activity.
-- ============================================================================

alter table public.audit_logs
  add column if not exists is_platform_action boolean not null default false;

-- ----------------------------------------------------------------------------
-- log_audit: add p_platform (defaults false, so every existing call site —
-- org-native actions logged from the app — is unaffected).
-- ----------------------------------------------------------------------------
drop function if exists public.log_audit(uuid, text, text, uuid, text, jsonb);

create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_platform boolean default false
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.audit_logs;
begin
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata, is_platform_action)
  values (p_org, auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_platform)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Mark the platform-console lifecycle actions as platform-only at the source.
-- ----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle public.billing_cycle default 'monthly',
  p_owner_user_id uuid default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
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
    period_end := case when p_billing_cycle = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end;
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
$$;

create or replace function public.soft_delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can delete organizations' using errcode = '42501';
  end if;
  update public.organizations
    set deleted_at = now(), deleted_by = auth.uid(), status = 'suspended'
    where id = p_org and deleted_at is null;
  perform public.log_audit(p_org, 'organization.soft_deleted', 'organization', p_org,
    'Organization moved to trash (30-day grace period)', '{}'::jsonb, true);
end;
$$;

create or replace function public.restore_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can restore organizations' using errcode = '42501';
  end if;
  update public.organizations
    set deleted_at = null, deleted_by = null, status = 'active'
    where id = p_org;
  perform public.log_audit(p_org, 'organization.restored', 'organization', p_org,
    'Organization restored from trash', '{}'::jsonb, true);
end;
$$;

-- ----------------------------------------------------------------------------
-- audit_select: exclude platform-only rows from org-side visibility; add a
-- "see your own actions" tier for members with neither org-admin status nor
-- the audit.read permission.
-- ----------------------------------------------------------------------------
drop policy if exists "audit_select" on public.audit_logs;

create policy "audit_select" on public.audit_logs
  for select using (
    public.is_platform_admin()
    or (
      not is_platform_action
      and (
        actor_id = auth.uid()
        or public.is_org_admin(organization_id)
        or public.has_permission(organization_id, 'audit.read')
      )
    )
  );
