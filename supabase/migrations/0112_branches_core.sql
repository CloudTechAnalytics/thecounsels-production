-- ============================================================================
-- Migration 0112 — Branches core: the `branches` table, one Head Office per
-- organization, and the branches.view / branches.manage permission pair.
--
-- Organization stays the tenant boundary; a branch is a secondary, WITHIN-
-- organization access boundary a firm can optionally subdivide into (Lagos /
-- Abuja / Kano, etc.). Every existing organization gets exactly one
-- auto-created "Head Office" branch below so every branch-eligible row added
-- in later migrations (0113-0117) always has somewhere safe to backfill to
-- — never assumed to be any particular city, just a neutral default an
-- admin can rename/re-flag later.
--
-- `branches` is read broadly (any active org member, mirroring roles_select's
-- own is_org_member precedent in 0002) because branch names are needed
-- everywhere a branch picker appears (invite dialog, matter/task/hearing
-- forms, the dashboard selector) — not just inside the Branches admin tab.
-- Only writes (create/edit/deactivate/set head office/assign members) are
-- gated behind the new branches.manage permission; branches.view is a
-- separate key that exists purely to gate the admin-only "Branches" tab and
-- its stats — it does not further restrict row-level SELECT.
-- ============================================================================

create table public.branches (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  code             text,
  address          text,
  city             text,
  state            text,
  country          text,
  phone            text,
  email            text,
  is_head_office   boolean not null default false,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, code)
);

create index idx_branches_organization on public.branches (organization_id);

-- Exactly one head office per org — a partial unique index (most rows have
-- is_head_office = false and must coexist freely, so a plain full unique
-- constraint on the column doesn't work).
create unique index branches_one_head_office_per_org
  on public.branches (organization_id)
  where is_head_office;

create trigger trg_branches_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

alter table public.branches enable row level security;

create policy "branches_select" on public.branches
  for select using (public.is_org_member(organization_id));

create policy "branches_write" on public.branches
  for all using (public.has_permission(organization_id, 'branches.manage'))
  with check (public.has_permission(organization_id, 'branches.manage'));

-- ----------------------------------------------------------------------------
-- set_head_office() — the one guarded way to flip which branch is the head
-- office. A plain client-side UPDATE could momentarily violate
-- branches_one_head_office_per_org, or (if the client only updates the new
-- row) leave two head offices, or (if a second statement fails) leave zero.
-- SECURITY DEFINER wraps both flips in one transaction — mirrors
-- reopen_matter()'s precedent of a narrow, permission-gated bypass.
-- ----------------------------------------------------------------------------
create or replace function public.set_head_office(p_org uuid, p_branch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(p_org, 'branches.manage') then
    raise exception 'Not authorized to set the head office for this organization';
  end if;
  if not exists (select 1 from public.branches where id = p_branch and organization_id = p_org and is_active) then
    raise exception 'Branch not found in this organization';
  end if;
  update public.branches set is_head_office = false where organization_id = p_org and is_head_office and id <> p_branch;
  update public.branches set is_head_office = true where id = p_branch;

  -- Audit logging for this call is done from the frontend service layer
  -- (branches.service.ts), same as every other branches mutation — not
  -- here, since log_audit() doesn't gain its p_branch_id parameter until
  -- migration 0117 and this function must stand on its own at 0112.
end;
$$;

grant execute on function public.set_head_office(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Backfill — every existing organization gets exactly one "Head Office"
-- branch now, before any later migration adds a branch_id column anywhere.
-- ----------------------------------------------------------------------------
insert into public.branches (organization_id, name, is_head_office, is_active)
select o.id, 'Head Office', true, true
from public.organizations o
where not exists (select 1 from public.branches b where b.organization_id = o.id);

-- ----------------------------------------------------------------------------
-- Permission catalog + default grants. The "leadership: every permission"
-- cross-join in 0003 only ran once, at seed time — every permission added
-- since needs its own explicit grant (exactly what 0110 did for
-- appointments.*). Only managing_partner/partner (and platform admins, via
-- has_permission()'s built-in is_platform_admin() bypass) get branches.* by
-- default; an org admin can grant it more broadly later via Roles &
-- Permissions.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description) values
  ('branches.view',   'branches', 'view',   'View branches and branch activity'),
  ('branches.manage', 'branches', 'manage', 'Create/edit/deactivate branches, set head office, assign members')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('branches.view', 'branches.manage')
where r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;
