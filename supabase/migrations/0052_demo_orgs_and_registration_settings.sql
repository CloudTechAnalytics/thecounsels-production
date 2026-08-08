-- Self-Service SaaS Onboarding Part E — Platform Console updates.
--
-- Extends the existing, unchanged create_organization() RPC (still
-- platform-admin-only, still the manual/migration/enterprise path) with an
-- organization_type parameter, adds reset_demo_organization() for clearing
-- a demo org's operational data, and grants Platform Admin write access to
-- registration_settings (already created in 0051, select-only there).

-- 1. create_organization() — additive p_org_type param. Demo/internal orgs
--    skip the subscriptions insert entirely (no trial countdown, no
--    billing, exactly per spec) — subscriptions is optional per-org, not
--    mandatory, so this is a clean skip, not a workaround.
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
  p_plan_id uuid default null,
  p_trial boolean default true,
  p_billing_cycle public.billing_cycle default 'monthly',
  p_owner_user_id uuid default null,
  p_org_type text default 'customer'
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
$$;

-- 2. reset_demo_organization() — Platform Admin only, guarded to demo orgs,
--    clears operational data while keeping the org/membership shell intact.
--    Same cascade-guard care as hard_delete_organization: children of
--    children (e.g. expense_receipts, matter_events) are covered by
--    deleting their parents, which already cascade via FK on delete.
create or replace function public.reset_demo_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can reset a demo organization' using errcode = '42501';
  end if;

  select organization_type into v_type from public.organizations where id = p_org;
  if v_type is null then
    raise exception 'Organization not found';
  end if;
  if v_type <> 'demo' then
    raise exception 'Only demo organizations can be reset' using errcode = 'P0001';
  end if;

  delete from public.payments where organization_id = p_org;
  delete from public.invoice_items where invoice_id in (select id from public.invoices where organization_id = p_org);
  delete from public.invoices where organization_id = p_org;
  delete from public.expense_receipts where organization_id = p_org;
  delete from public.expenses where organization_id = p_org;
  delete from public.time_entries where organization_id = p_org;
  delete from public.matter_events where organization_id = p_org;
  delete from public.matter_notes where organization_id = p_org;
  delete from public.hearings where organization_id = p_org;
  delete from public.tasks where organization_id = p_org;
  delete from public.documents where organization_id = p_org;
  delete from public.matter_assignments where organization_id = p_org;
  delete from public.matters where organization_id = p_org;
  delete from public.client_contacts where organization_id = p_org;
  delete from public.clients where organization_id = p_org;
  delete from public.notifications where organization_id = p_org;

  perform public.log_audit(p_org, 'organization.demo_reset', 'organization', p_org,
    'Demo organization data cleared', '{}'::jsonb, true);
end;
$$;

grant execute on function public.reset_demo_organization(uuid) to authenticated;

-- 3. registration_settings already has select-for-all + platform-admin-only
--    update from 0051 — nothing to change there; this section intentionally
--    left as documentation that Part E's settings UI needs no new policy.
