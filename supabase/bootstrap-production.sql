-- ============================================================================
-- ONE-TIME PRODUCTION BOOTSTRAP
--
-- Concatenation of every migration in supabase/migrations/, in order,
-- for pasting into a BRAND NEW, EMPTY Supabase project's SQL Editor in one
-- go — used to stand up the dedicated production project (see the
-- Development/Testing/Production environment split).
--
-- NOT part of the normal migration flow. Do not run this against the
-- existing dev/test project — it already has these applied one at a time.
--
-- BEFORE RUNNING: this file hardcodes the OLD (dev/test) project's URL
-- in 4 places (search for '.supabase.co') — those must be replaced with
-- the NEW production project's URL first, or the hearing/task reminder
-- cron jobs and plan-gated notification dispatch will call the wrong
-- project. Regenerate this file after creating the production project
-- and ask to have it swapped in automatically.
--
-- Regenerate with:
--   for f in supabase/migrations/*.sql; do echo; echo "-- ==> $f"; cat "$f"; done > supabase/bootstrap-production.sql
-- ============================================================================

-- ============================================================
-- ==> supabase/migrations/0001_core_multitenancy.sql
-- ============================================================
-- ============================================================================
-- CloudTech Legal Suite — The Counsel
-- Migration 0001 — Core multi-tenancy: organizations, profiles, roles,
-- permissions, memberships, invitations, audit logs.
--
-- Conventions:
--   * All primary keys are UUID (gen_random_uuid()).
--   * Every tenant-scoped table carries organization_id -> organizations(id).
--   * created_at / updated_at maintained by triggers.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";         -- case-insensitive email

-- ----------------------------------------------------------------------------
-- Enumerated types
-- ----------------------------------------------------------------------------
create type public.org_status as enum ('trial', 'active', 'suspended', 'cancelled');

create type public.membership_status as enum ('invited', 'active', 'suspended', 'disabled');

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

-- The 12 canonical roles. Custom per-org roles may be added later with is_system = false.
create type public.role_key as enum (
  'platform_owner',
  'platform_admin',
  'managing_partner',
  'partner',
  'senior_associate',
  'associate',
  'junior_associate',
  'paralegal',
  'secretary',
  'finance',
  'hr',
  'receptionist'
);

-- ----------------------------------------------------------------------------
-- Shared helpers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- organizations  (the tenant root)
-- ----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext not null unique,
  legal_name    text,
  logo_url      text,
  primary_color text not null default '#B38A3E',
  status        public.org_status not null default 'trial',
  plan          text not null default 'professional',
  billing_email citext,
  phone         text,
  website       text,
  timezone      text not null default 'UTC',
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users; platform-level identity)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   citext not null,
  full_name               text,
  avatar_url              text,
  phone                   text,
  title                   text,
  is_platform_admin       boolean not null default false,
  default_organization_id uuid references public.organizations(id) on delete set null,
  last_seen_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- permissions  (global catalog of resource.action grants)
-- ----------------------------------------------------------------------------
create table public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,        -- e.g. 'cases.create'
  resource    text not null,               -- e.g. 'cases'
  action      text not null,               -- e.g. 'create'
  description text,
  created_at  timestamptz not null default now()
);

create index idx_permissions_resource on public.permissions (resource);

-- ----------------------------------------------------------------------------
-- roles  (system templates have organization_id = null; custom roles are per-org)
-- ----------------------------------------------------------------------------
create table public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key             public.role_key,
  name            text not null,
  description     text,
  rank            integer not null default 100,  -- lower = more senior/privileged
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- system roles are unique by key; custom roles unique by (org, name)
  constraint uq_system_role_key unique (key),
  constraint uq_org_role_name unique (organization_id, name)
);

create index idx_roles_organization on public.roles (organization_id);

create trigger trg_roles_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- role_permissions  (M:N)
-- ----------------------------------------------------------------------------
create table public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create index idx_role_permissions_permission on public.role_permissions (permission_id);

-- ----------------------------------------------------------------------------
-- memberships  (a user's seat within one organization)
-- ----------------------------------------------------------------------------
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role_id         uuid not null references public.roles(id) on delete restrict,
  status          public.membership_status not null default 'active',
  is_owner        boolean not null default false,
  title           text,
  invited_by      uuid references public.profiles(id) on delete set null,
  invited_at      timestamptz,
  joined_at       timestamptz default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_membership_org_user unique (organization_id, user_id)
);

create index idx_memberships_user on public.memberships (user_id);
create index idx_memberships_org on public.memberships (organization_id);
create index idx_memberships_role on public.memberships (role_id);

create trigger trg_memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- invitations  (org admin invites a user by email)
-- ----------------------------------------------------------------------------
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           citext not null,
  role_id         uuid not null references public.roles(id) on delete restrict,
  token           uuid not null default gen_random_uuid() unique,
  status          public.invitation_status not null default 'pending',
  invited_by      uuid references public.profiles(id) on delete set null,
  message         text,
  expires_at      timestamptz not null default (now() + interval '14 days'),
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint uq_pending_invite unique (organization_id, email)
);

create index idx_invitations_org on public.invitations (organization_id);
create index idx_invitations_email on public.invitations (email);

create trigger trg_invitations_updated_at
  before update on public.invitations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- audit_logs  (append-only activity trail, per tenant)
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  action          text not null,             -- e.g. 'membership.created'
  entity_type     text,                      -- e.g. 'membership'
  entity_id       uuid,
  summary         text,
  metadata        jsonb not null default '{}'::jsonb,
  ip_address      inet,
  created_at      timestamptz not null default now()
);

create index idx_audit_logs_org_created on public.audit_logs (organization_id, created_at desc);
create index idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- New auth user -> profile row
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ==> supabase/migrations/0002_rls_policies.sql
-- ============================================================
-- ============================================================================
-- Migration 0002 — Row Level Security
-- Helper functions are SECURITY DEFINER + STABLE so policies can call them
-- without triggering recursive RLS evaluation. Tenant isolation is enforced
-- centrally here: Law Firm A can never read Law Firm B's rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Authorization helper functions
-- ----------------------------------------------------------------------------

-- Is the current user a platform-level administrator?
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Is the current user an active member of the given organization?
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.memberships m
        where m.user_id = auth.uid()
          and m.organization_id = org
          and m.status = 'active'
      );
$$;

-- Does the current user hold a specific permission within the organization?
create or replace function public.has_permission(org uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.memberships m
        join public.role_permissions rp on rp.role_id = m.role_id
        join public.permissions p on p.id = rp.permission_id
        where m.user_id = auth.uid()
          and m.organization_id = org
          and m.status = 'active'
          and p.key = perm
      );
$$;

-- Is the current user an administrator of the organization (owner or member-manager)?
create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.memberships m
        where m.user_id = auth.uid()
          and m.organization_id = org
          and m.status = 'active'
          and m.is_owner = true
      )
      or public.has_permission(org, 'members.manage');
$$;

-- Do the current user and target user share at least one active organization?
create or replace function public.shares_organization(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships me
    join public.memberships them
      on them.organization_id = me.organization_id
    where me.user_id = auth.uid()
      and me.status = 'active'
      and them.user_id = target
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.shares_organization(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS
-- ----------------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.permissions     enable row level security;
alter table public.roles           enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships     enable row level security;
alter table public.invitations     enable row level security;
alter table public.audit_logs      enable row level security;

-- ----------------------------------------------------------------------------
-- organizations
-- ----------------------------------------------------------------------------
create policy "org_select_members" on public.organizations
  for select using (public.is_org_member(id));

create policy "org_insert_platform_admin" on public.organizations
  for insert with check (public.is_platform_admin());

create policy "org_update_admins" on public.organizations
  for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "org_delete_platform_admin" on public.organizations
  for delete using (public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy "profile_select_self_or_colleague" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_platform_admin()
    or public.shares_organization(id)
  );

create policy "profile_update_self" on public.profiles
  for update using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- profiles are created by the auth trigger (security definer); no public insert.

-- ----------------------------------------------------------------------------
-- permissions (read-only catalog for all authenticated users)
-- ----------------------------------------------------------------------------
create policy "permissions_select_all" on public.permissions
  for select using (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- roles
-- ----------------------------------------------------------------------------
create policy "roles_select" on public.roles
  for select using (
    organization_id is null
    or public.is_org_member(organization_id)
  );

create policy "roles_write_admin" on public.roles
  for all using (
    (organization_id is not null and public.is_org_admin(organization_id))
    or public.is_platform_admin()
  )
  with check (
    (organization_id is not null and public.is_org_admin(organization_id))
    or public.is_platform_admin()
  );

-- ----------------------------------------------------------------------------
-- role_permissions
-- ----------------------------------------------------------------------------
create policy "role_permissions_select" on public.role_permissions
  for select using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (r.organization_id is null or public.is_org_member(r.organization_id))
    )
  );

create policy "role_permissions_write_admin" on public.role_permissions
  for all using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (
          (r.organization_id is not null and public.is_org_admin(r.organization_id))
          or public.is_platform_admin()
        )
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (
          (r.organization_id is not null and public.is_org_admin(r.organization_id))
          or public.is_platform_admin()
        )
    )
  );

-- ----------------------------------------------------------------------------
-- memberships
-- ----------------------------------------------------------------------------
create policy "memberships_select" on public.memberships
  for select using (
    user_id = auth.uid()
    or public.is_org_member(organization_id)
  );

create policy "memberships_write_admin" on public.memberships
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ----------------------------------------------------------------------------
-- invitations
-- ----------------------------------------------------------------------------
create policy "invitations_select" on public.invitations
  for select using (
    public.is_org_admin(organization_id)
    or email = (select p.email from public.profiles p where p.id = auth.uid())
  );

create policy "invitations_write_admin" on public.invitations
  for all using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- ----------------------------------------------------------------------------
-- audit_logs (append-only; read gated by permission)
-- ----------------------------------------------------------------------------
create policy "audit_select" on public.audit_logs
  for select using (
    public.is_org_admin(organization_id)
    or public.has_permission(organization_id, 'audit.read')
  );

create policy "audit_insert_members" on public.audit_logs
  for insert with check (public.is_org_member(organization_id));

-- ============================================================
-- ==> supabase/migrations/0003_seed_roles_permissions.sql
-- ============================================================
-- ============================================================================
-- Migration 0003 — Reference data: permission catalog, system roles,
-- and default role -> permission grants.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permission catalog
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description) values
  ('dashboard.view',      'dashboard',      'view',   'View the executive dashboard'),
  ('organization.view',   'organization',   'view',   'View organization profile'),
  ('organization.manage', 'organization',   'manage', 'Edit organization profile & settings'),
  ('offices.view',        'offices',        'view',   'View office locations'),
  ('offices.manage',      'offices',        'manage', 'Create/edit office locations'),
  ('practice_areas.view', 'practice_areas', 'view',   'View practice areas'),
  ('practice_areas.manage','practice_areas','manage', 'Create/edit practice areas'),
  ('departments.view',    'departments',    'view',   'View departments'),
  ('departments.manage',  'departments',    'manage', 'Create/edit departments'),
  ('roles.view',          'roles',          'view',   'View roles & permissions'),
  ('roles.manage',        'roles',          'manage', 'Create/edit roles & permissions'),
  ('members.view',        'members',        'view',   'View organization users'),
  ('members.manage',      'members',        'manage', 'Invite, edit & deactivate users'),
  ('audit.read',          'audit',          'read',   'Read the audit log'),
  ('settings.manage',     'settings',       'manage', 'Manage system settings'),
  ('staff.view',          'staff',          'view',   'View lawyers & staff profiles'),
  ('staff.manage',        'staff',          'manage', 'Manage staff profiles & performance'),
  ('clients.view',        'clients',        'view',   'View clients'),
  ('clients.create',      'clients',        'create', 'Create clients'),
  ('clients.update',      'clients',        'update', 'Edit clients'),
  ('clients.delete',      'clients',        'delete', 'Delete clients'),
  ('matters.view',        'matters',        'view',   'View matters'),
  ('matters.create',      'matters',        'create', 'Open new matters'),
  ('matters.update',      'matters',        'update', 'Edit matters'),
  ('matters.delete',      'matters',        'delete', 'Close/delete matters'),
  ('matters.assign',      'matters',        'assign', 'Assign lawyers to matters'),
  ('documents.view',      'documents',      'view',   'View documents'),
  ('documents.upload',    'documents',      'upload', 'Upload documents'),
  ('documents.update',    'documents',      'update', 'Rename/move/tag documents'),
  ('documents.delete',    'documents',      'delete', 'Delete documents'),
  ('documents.manage',    'documents',      'manage', 'Manage folders & permissions'),
  ('hearings.view',       'hearings',       'view',   'View hearings'),
  ('hearings.create',     'hearings',       'create', 'Schedule hearings'),
  ('hearings.update',     'hearings',       'update', 'Edit hearings & outcomes'),
  ('hearings.delete',     'hearings',       'delete', 'Delete hearings'),
  ('calendar.view',       'calendar',       'view',   'View the calendar'),
  ('tasks.view',          'tasks',          'view',   'View tasks'),
  ('tasks.create',        'tasks',          'create', 'Create tasks'),
  ('tasks.update',        'tasks',          'update', 'Edit/complete tasks'),
  ('tasks.delete',        'tasks',          'delete', 'Delete tasks'),
  ('tasks.assign',        'tasks',          'assign', 'Assign tasks to others'),
  ('billing.view',        'billing',        'view',   'View billing & revenue'),
  ('invoices.manage',     'invoices',       'manage', 'Create & send invoices'),
  ('payments.manage',     'payments',       'manage', 'Record payments'),
  ('expenses.manage',     'expenses',       'manage', 'Manage expenses'),
  ('trust.manage',        'trust',          'manage', 'Manage trust accounts'),
  ('reports.view',        'reports',        'view',   'View reports'),
  ('reports.financial',   'reports',        'financial','View financial reports'),
  ('notifications.view',  'notifications',  'view',   'View notifications')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- System roles (organization_id = null, is_system = true). Lower rank = senior.
-- ----------------------------------------------------------------------------
insert into public.roles (key, name, description, rank, is_system, organization_id) values
  ('platform_owner',   'Platform Owner',        'Owner of the CloudTech platform', 0,  true, null),
  ('platform_admin',   'Platform Administrator','Platform operations & tenant management', 5, true, null),
  ('managing_partner', 'Managing Partner',      'Runs the firm; full access', 10, true, null),
  ('partner',          'Partner',               'Senior equity partner', 20, true, null),
  ('senior_associate', 'Senior Associate',      'Experienced fee earner', 30, true, null),
  ('associate',        'Associate',             'Fee earner', 40, true, null),
  ('junior_associate', 'Junior Associate',      'Trainee fee earner', 50, true, null),
  ('paralegal',        'Paralegal',             'Legal support professional', 60, true, null),
  ('finance',          'Finance',               'Billing & accounts', 65, true, null),
  ('hr',               'HR',                    'People operations', 66, true, null),
  ('secretary',        'Secretary',             'Legal secretary', 70, true, null),
  ('receptionist',     'Receptionist',          'Front desk', 80, true, null)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Default grants
-- ----------------------------------------------------------------------------

-- Platform + firm leadership: every permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- Fee earners (senior/associate/junior).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','calendar.view',
  'staff.view','reports.view','billing.view',
  'clients.view','clients.create','clients.update',
  'matters.view','matters.create','matters.update','matters.assign',
  'documents.view','documents.upload','documents.update',
  'hearings.view','hearings.create','hearings.update',
  'tasks.view','tasks.create','tasks.update','tasks.assign'
)
where r.key in ('senior_associate','associate','junior_associate')
on conflict do nothing;

-- Paralegal.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','calendar.view','staff.view',
  'clients.view','matters.view','matters.update',
  'documents.view','documents.upload','documents.update',
  'hearings.view','hearings.create','hearings.update',
  'tasks.view','tasks.create','tasks.update'
)
where r.key = 'paralegal'
on conflict do nothing;

-- Finance.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','clients.view','matters.view',
  'billing.view','invoices.manage','payments.manage','expenses.manage','trust.manage',
  'reports.view','reports.financial'
)
where r.key = 'finance'
on conflict do nothing;

-- HR.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','members.view','staff.view','staff.manage',
  'departments.view','reports.view'
)
where r.key = 'hr'
on conflict do nothing;

-- Secretary & Receptionist (front-office).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','calendar.view',
  'clients.view','matters.view','documents.view',
  'hearings.view','tasks.view','tasks.create','tasks.update'
)
where r.key in ('secretary','receptionist')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0004_rpc_functions.sql
-- ============================================================
-- ============================================================================
-- Migration 0004 — Server-side RPCs for the foundation flows.
-- All are SECURITY DEFINER with explicit internal authorization checks.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Audit helper — insert an audit entry.
-- ----------------------------------------------------------------------------
create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.audit_logs;
begin
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values (p_org, auth.uid(), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb))
  returning * into rec;
  return rec;
end;
$$;

-- ----------------------------------------------------------------------------
-- Provision a new organization (Platform Admin only) and optionally seat an owner.
-- ----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
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
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations'
      using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, legal_name, status)
  values (p_name, lower(p_slug), p_legal_name, 'active')
  returning * into org;

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';

    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;

    update public.profiles
      set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned', jsonb_build_object('name', p_name, 'slug', lower(p_slug)));

  return org;
end;
$$;

-- ----------------------------------------------------------------------------
-- Accept an invitation as the currently signed-in user.
-- ----------------------------------------------------------------------------
create or replace function public.accept_invitation(p_token uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
  me_email citext;
  mem public.memberships;
begin
  select email into me_email from public.profiles where id = auth.uid();
  if me_email is null then
    raise exception 'No authenticated profile' using errcode = '42501';
  end if;

  select * into inv from public.invitations where token = p_token;
  if inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Invitation is no longer valid' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;
  if lower(inv.email) <> lower(me_email) then
    raise exception 'Invitation was issued to a different email' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (inv.organization_id, auth.uid(), inv.role_id, 'active', inv.invited_by, inv.created_at, now())
  on conflict (organization_id, user_id)
    do update set status = 'active', role_id = excluded.role_id
  returning * into mem;

  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  update public.profiles
    set default_organization_id = coalesce(default_organization_id, inv.organization_id)
    where id = auth.uid();

  perform public.log_audit(inv.organization_id, 'invitation.accepted', 'membership', mem.id,
    'User accepted invitation', jsonb_build_object('email', me_email));

  return mem;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.create_organization(text, text, text, uuid) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0005_bootstrap_platform_owner.sql
-- ============================================================
-- ============================================================================
-- Migration 0005 — Bootstrap & self-registration
--
-- * The FIRST user to register becomes the Platform Owner automatically. This
--   removes any need for seed data or manual SQL: sign up with your email and
--   you own the platform. Every subsequent signup is an ordinary user with no
--   access until they accept an invitation to an organization.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_first_user boolean;
begin
  -- If no platform admin exists yet, the very first account bootstraps ownership.
  select not exists (select 1 from public.profiles where is_platform_admin) into v_is_first_user;

  insert into public.profiles (id, email, full_name, avatar_url, is_platform_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    v_is_first_user
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0006_platform_billing.sql
-- ============================================================
-- ============================================================================
-- Migration 0006 — Platform commercial layer: plans, subscriptions, trials,
-- organization enrichments, and soft-delete lifecycle.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'paused', 'cancelled'
);
create type public.billing_cycle as enum ('monthly', 'yearly');

-- ----------------------------------------------------------------------------
-- Organization enrichments
-- ----------------------------------------------------------------------------
alter table public.organizations
  add column industry text,
  add column storage_used_bytes bigint not null default 0,
  add column last_login_at timestamptz,
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id) on delete set null;

create index idx_organizations_deleted_at on public.organizations (deleted_at);

-- ----------------------------------------------------------------------------
-- plans  (reference data; platform-managed, org-readable)
-- ----------------------------------------------------------------------------
create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  key            text unique,                      -- null for custom plans
  name           text not null,
  description    text,
  currency       text not null default 'NGN',
  price_monthly  numeric(12,2) not null default 0,
  price_yearly   numeric(12,2) not null default 0,
  max_users      integer,                          -- null = unlimited
  storage_gb     integer not null default 0,
  support_level  text not null default 'Community',
  features       jsonb not null default '{}'::jsonb,
  highlights     text[] not null default '{}',
  is_custom      boolean not null default false,
  is_active      boolean not null default true,
  sort_order     integer not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger trg_plans_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- subscriptions  (one per organization)
-- ----------------------------------------------------------------------------
create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null unique references public.organizations(id) on delete cascade,
  plan_id            uuid references public.plans(id) on delete set null,
  status             public.subscription_status not null default 'trialing',
  billing_cycle      public.billing_cycle not null default 'monthly',
  seats              integer not null default 5,
  auto_renew         boolean not null default true,
  trial_ends_at      timestamptz,
  current_period_end timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_subscriptions_plan on public.subscriptions (plan_id);
create index idx_subscriptions_status on public.subscriptions (status);

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

-- Plans: any authenticated user may read (orgs need their plan); platform writes.
create policy "plans_select_all" on public.plans
  for select using (auth.role() = 'authenticated');
create policy "plans_write_platform" on public.plans
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Subscriptions: org members read their own; platform admins manage all.
create policy "subscriptions_select" on public.subscriptions
  for select using (public.is_org_member(organization_id));
create policy "subscriptions_write_platform" on public.subscriptions
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ----------------------------------------------------------------------------
-- Seed default plans (Naira)
-- ----------------------------------------------------------------------------
insert into public.plans (key, name, description, price_monthly, price_yearly, max_users, storage_gb, support_level, features, highlights, sort_order) values
  ('starter', 'Starter', 'For small practices getting started', 50000, 500000, 5, 10, 'Community',
    '{"case_management":true,"calendar":true,"tasks":true,"reports_basic":true,"billing":false,"document_versioning":false,"custom_branding":false,"sso":false,"audit_logs":false,"api_access":false,"advanced_security":false,"ai_features":false}'::jsonb,
    array['Up to 5 users','10 GB storage','Case management','Calendar','Tasks','Basic reports','Community support'], 10),
  ('professional', 'Professional', 'For growing firms', 100000, 1000000, 15, 100, 'Priority Email',
    '{"case_management":true,"calendar":true,"tasks":true,"reports_basic":true,"reports_advanced":true,"billing":true,"invoices":true,"document_versioning":true,"custom_branding":false,"sso":false,"audit_logs":false,"api_access":false,"advanced_security":false,"ai_features":false}'::jsonb,
    array['Up to 15 users','100 GB storage','Everything in Starter','Billing & invoices','Advanced reports','Document versioning','Priority email support'], 20),
  ('enterprise', 'Enterprise', 'For large firms with advanced needs', 250000, 2500000, null, 1024, 'Dedicated',
    '{"case_management":true,"calendar":true,"tasks":true,"reports_basic":true,"reports_advanced":true,"billing":true,"invoices":true,"document_versioning":true,"custom_branding":true,"sso":true,"audit_logs":true,"api_access":true,"advanced_security":true,"ai_features":true}'::jsonb,
    array['Unlimited users','1 TB storage','Everything included','Custom branding','SSO','Dedicated support','Audit logs','API access','Advanced security'], 30)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- create_organization: also start a 14-day Professional trial subscription.
-- ----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_legal_name text default null,
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
  trial_plan_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can create organizations'
      using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, legal_name, status)
  values (p_name, lower(p_slug), p_legal_name, 'trial')
  returning * into org;

  select id into trial_plan_id from public.plans where key = 'professional';
  insert into public.subscriptions (organization_id, plan_id, status, billing_cycle, seats, trial_ends_at, current_period_end)
  values (org.id, trial_plan_id, 'trialing', 'monthly', 5, now() + interval '14 days', now() + interval '14 days');

  if p_owner_user_id is not null then
    select id into owner_role_id from public.roles where key = 'managing_partner';
    insert into public.memberships (organization_id, user_id, role_id, status, is_owner, joined_at)
    values (org.id, p_owner_user_id, owner_role_id, 'active', true, now())
    on conflict (organization_id, user_id) do nothing;
    update public.profiles set default_organization_id = coalesce(default_organization_id, org.id)
      where id = p_owner_user_id;
  end if;

  perform public.log_audit(org.id, 'organization.created', 'organization', org.id,
    'Organization provisioned with 14-day trial', jsonb_build_object('name', p_name, 'slug', lower(p_slug)));
  return org;
end;
$$;

-- ----------------------------------------------------------------------------
-- Soft-delete lifecycle
-- ----------------------------------------------------------------------------
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
    'Organization moved to trash (30-day grace period)');
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
    'Organization restored from trash');
end;
$$;

-- Permanently remove organizations soft-deleted more than 30 days ago.
create or replace function public.purge_deleted_organizations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with removed as (
    delete from public.organizations
    where deleted_at is not null and deleted_at < now() - interval '30 days'
    returning id
  )
  select count(*) into n from removed;
  return n;
end;
$$;

grant execute on function public.soft_delete_organization(uuid) to authenticated;
grant execute on function public.restore_organization(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0007_org_plan_and_purge.sql
-- ============================================================
-- ============================================================================
-- Migration 0007 — Plan-selectable organization creation + permanent delete.
-- ============================================================================

-- Replace create_organization with a plan-aware version. Drop the old 4-arg
-- signature first so we don't leave an ambiguous overload behind.
drop function if exists public.create_organization(text, text, text, uuid);

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
  values (p_name, lower(p_slug), p_legal_name, case when p_trial then 'trial' else 'active' end)
  returning * into org;

  -- Fall back to the Professional plan when none was chosen (e.g. plain trial).
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
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial));
  return org;
end;
$$;

-- Permanently remove a single organization already in the trash.
create or replace function public.hard_delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can delete organizations' using errcode = '42501';
  end if;
  delete from public.organizations where id = p_org and deleted_at is not null;
end;
$$;

grant execute on function public.hard_delete_organization(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0008_purge_orphan_users.sql
-- ============================================================
-- ============================================================================
-- Migration 0008 — Clean up firm accounts when their organization is deleted.
--
-- Deleting an organization previously left its users' login accounts behind
-- (profiles/auth.users are not owned by the org row). This:
--   1. Removes any already-orphaned firm accounts (non-platform users that
--      belong to no organization).
--   2. Makes hard_delete_organization also delete accounts that existed ONLY
--      for the deleted firm (never touching platform staff or shared users).
-- Deleting from auth.users cascades to public.profiles and public.memberships.
-- ============================================================================

-- 1) One-time cleanup of existing orphans.
delete from auth.users u
where not exists (select 1 from public.memberships m where m.user_id = u.id)
  and not exists (select 1 from public.profiles p where p.id = u.id and p.is_platform_admin);

-- 2) Purge exclusive member accounts as part of a permanent org delete.
create or replace function public.hard_delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can delete organizations' using errcode = '42501';
  end if;

  -- Delete accounts that belong to this org only (skip platform staff and
  -- anyone who is also a member of another organization).
  delete from auth.users u
  using public.memberships m
  where m.organization_id = p_org
    and m.user_id = u.id
    and not exists (select 1 from public.profiles p where p.id = u.id and p.is_platform_admin)
    and not exists (
      select 1 from public.memberships m2 where m2.user_id = u.id and m2.organization_id <> p_org
    );

  delete from public.organizations where id = p_org and deleted_at is not null;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0009_fix_create_organization_enum_cast.sql
-- ============================================================
-- ============================================================================
-- Migration 0009 — Fix create_organization enum cast.
--
-- The organization status was set from `case when p_trial then 'trial' else
-- 'active' end`, whose result type is `text`. Postgres will not implicitly cast
-- a CASE result into the `org_status` enum, so inserts failed with:
--   column "status" is of type org_status but expression is of type text
-- Adding an explicit ::public.org_status cast resolves it.
-- ============================================================================

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
    'Organization provisioned', jsonb_build_object('name', p_name, 'trial', p_trial));
  return org;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0010_clients_and_realtime.sql
-- ============================================================
-- ============================================================================
-- Migration 0010 — Clients module + Realtime for the activity feed.
-- First firm-data module: establishes the org-scoped RLS pattern using
-- has_permission(organization_id, '<perm>').
-- ============================================================================

create type public.client_type as enum ('individual', 'corporate');
create type public.client_status as enum ('active', 'inactive', 'prospect');

create table public.clients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type            public.client_type not null default 'individual',
  display_name    text not null,
  first_name      text,
  last_name       text,
  company_name    text,
  email           text,
  phone           text,
  website         text,
  address         text,
  city            text,
  country         text,
  status          public.client_status not null default 'active',
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_clients_org on public.clients (organization_id);
create index idx_clients_org_status on public.clients (organization_id, status);
create index idx_clients_org_type on public.clients (organization_id, type);
create index idx_clients_display_name on public.clients (organization_id, display_name);

create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- RLS — org-scoped, permission-gated.
alter table public.clients enable row level security;

create policy "clients_select" on public.clients
  for select using (public.has_permission(organization_id, 'clients.view'));
create policy "clients_insert" on public.clients
  for insert with check (public.has_permission(organization_id, 'clients.create'));
create policy "clients_update" on public.clients
  for update using (public.has_permission(organization_id, 'clients.update'))
  with check (public.has_permission(organization_id, 'clients.update'));
create policy "clients_delete" on public.clients
  for delete using (public.has_permission(organization_id, 'clients.delete'));

-- ----------------------------------------------------------------------------
-- Realtime: stream audit events for the live activity feed. RLS still applies,
-- so each firm only receives its own rows.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_logs'
  ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end $$;

-- ============================================================
-- ==> supabase/migrations/0011_matters_documents.sql
-- ============================================================
-- ============================================================================
-- Migration 0011 — Matters (core), matter notes, documents + Storage.
-- ============================================================================

create type public.matter_status as enum ('open', 'pending', 'in_court', 'closed', 'won', 'lost');

-- Per-org, per-year running counter for human-friendly matter numbers.
create table public.matter_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year            int not null,
  seq             int not null default 0,
  primary key (organization_id, year)
);

create table public.matters (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  matter_number    text,
  title            text not null,
  description      text,
  client_id        uuid references public.clients(id) on delete set null,
  practice_area    text,
  status           public.matter_status not null default 'open',
  lead_lawyer_id   uuid references public.profiles(id) on delete set null,
  opposing_counsel text,
  court            text,
  judge            text,
  priority         text not null default 'medium',
  opened_on        date not null default current_date,
  closed_on        date,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, matter_number)
);

create index idx_matters_org on public.matters (organization_id);
create index idx_matters_org_status on public.matters (organization_id, status);
create index idx_matters_client on public.matters (client_id);

create trigger trg_matters_updated_at
  before update on public.matters
  for each row execute function public.set_updated_at();

-- Assign MAT-<year>-<seq> on insert.
create or replace function public.assign_matter_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  if new.matter_number is not null and new.matter_number <> '' then
    return new;
  end if;
  insert into public.matter_counters (organization_id, year, seq)
    values (new.organization_id, y, 1)
    on conflict (organization_id, year) do update set seq = public.matter_counters.seq + 1
    returning seq into n;
  new.matter_number := 'MAT-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$$;

create trigger trg_matters_number
  before insert on public.matters
  for each row execute function public.assign_matter_number();

-- Notes ----------------------------------------------------------------------
create table public.matter_notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index idx_matter_notes_matter on public.matter_notes (matter_id, created_at desc);

-- Documents -------------------------------------------------------------------
create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid references public.matters(id) on delete cascade,
  name            text not null,
  storage_path    text not null unique,
  mime_type       text,
  size_bytes      bigint,
  category        text,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_documents_org on public.documents (organization_id);
create index idx_documents_matter on public.documents (matter_id, created_at desc);

-- RLS -------------------------------------------------------------------------
alter table public.matters enable row level security;
alter table public.matter_notes enable row level security;
alter table public.documents enable row level security;

create policy "matters_select" on public.matters
  for select using (public.has_permission(organization_id, 'matters.view'));
create policy "matters_insert" on public.matters
  for insert with check (public.has_permission(organization_id, 'matters.create'));
create policy "matters_update" on public.matters
  for update using (public.has_permission(organization_id, 'matters.update'))
  with check (public.has_permission(organization_id, 'matters.update'));
create policy "matters_delete" on public.matters
  for delete using (public.has_permission(organization_id, 'matters.delete'));

create policy "matter_notes_select" on public.matter_notes
  for select using (public.has_permission(organization_id, 'matters.view'));
create policy "matter_notes_insert" on public.matter_notes
  for insert with check (public.has_permission(organization_id, 'matters.view'));
create policy "matter_notes_delete" on public.matter_notes
  for delete using (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid());

create policy "documents_select" on public.documents
  for select using (public.has_permission(organization_id, 'documents.view'));
create policy "documents_insert" on public.documents
  for insert with check (public.has_permission(organization_id, 'documents.upload'));
create policy "documents_update" on public.documents
  for update using (public.has_permission(organization_id, 'documents.update'))
  with check (public.has_permission(organization_id, 'documents.update'));
create policy "documents_delete" on public.documents
  for delete using (public.has_permission(organization_id, 'documents.delete'));

-- ----------------------------------------------------------------------------
-- Storage: private 'documents' bucket. Object paths are <org_id>/<...>, so the
-- first path segment identifies the tenant and drives permission checks.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view')
  );
create policy "documents_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.upload')
  );
create policy "documents_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.delete')
  );

-- ============================================================
-- ==> supabase/migrations/0012_matter_tracking.sql
-- ============================================================
-- ============================================================================
-- Migration 0012 — Matter tracking: a per-matter timeline of everything that
-- happens on a matter. Automatic events are captured by triggers so the history
-- is complete regardless of which client wrote the change; users can also log
-- manual updates.
-- ============================================================================

create table public.matter_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  kind            text not null, -- created | status_changed | note_added | document_added | document_removed | update
  summary         text not null,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index idx_matter_events_matter on public.matter_events (matter_id, created_at desc);

alter table public.matter_events enable row level security;

create policy "matter_events_select" on public.matter_events
  for select using (public.has_permission(organization_id, 'matters.view'));
create policy "matter_events_insert" on public.matter_events
  for insert with check (public.has_permission(organization_id, 'matters.view'));
create policy "matter_events_delete" on public.matter_events
  for delete using (public.has_permission(organization_id, 'matters.update') or actor_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Triggers — automatic timeline entries.
-- ----------------------------------------------------------------------------
create or replace function public.track_matter_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.id, auth.uid(), 'created', 'Matter opened as ' || new.status);
  return new;
end $$;

create or replace function public.track_matter_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.id, auth.uid(), 'status_changed',
            'Status changed from ' || old.status || ' to ' || new.status,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

create or replace function public.track_note_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, coalesce(new.author_id, auth.uid()), 'note_added',
          'Added a note: ' || left(new.body, 80));
  return new;
end $$;

create or replace function public.track_document_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, coalesce(new.uploaded_by, auth.uid()), 'document_added',
            'Uploaded ' || new.name);
  end if;
  return new;
end $$;

create or replace function public.track_document_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (old.organization_id, old.matter_id, auth.uid(), 'document_removed', 'Removed ' || old.name);
  end if;
  return old;
end $$;

create trigger trg_track_matter_created
  after insert on public.matters for each row execute function public.track_matter_created();
create trigger trg_track_matter_status
  after update on public.matters for each row execute function public.track_matter_status();
create trigger trg_track_note_added
  after insert on public.matter_notes for each row execute function public.track_note_added();
create trigger trg_track_document_added
  after insert on public.documents for each row execute function public.track_document_added();
create trigger trg_track_document_removed
  after delete on public.documents for each row execute function public.track_document_removed();

-- ============================================================
-- ==> supabase/migrations/0013_hearings.sql
-- ============================================================
-- ============================================================================
-- Migration 0013 — Hearings (court calendar). Calendar views read from here.
-- ============================================================================

create type public.hearing_type as enum ('mention', 'hearing', 'trial', 'ruling', 'motion', 'conference', 'other');
create type public.hearing_status as enum ('scheduled', 'adjourned', 'held', 'cancelled');

create table public.hearings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  matter_id        uuid references public.matters(id) on delete cascade,
  title            text not null,
  hearing_at       timestamptz not null,
  duration_minutes int,
  location         text,
  court            text,
  judge            text,
  type             public.hearing_type not null default 'hearing',
  status           public.hearing_status not null default 'scheduled',
  outcome          text,
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_hearings_org on public.hearings (organization_id);
create index idx_hearings_org_at on public.hearings (organization_id, hearing_at);
create index idx_hearings_matter on public.hearings (matter_id);

create trigger trg_hearings_updated_at
  before update on public.hearings
  for each row execute function public.set_updated_at();

alter table public.hearings enable row level security;

create policy "hearings_select" on public.hearings
  for select using (public.has_permission(organization_id, 'hearings.view'));
create policy "hearings_insert" on public.hearings
  for insert with check (public.has_permission(organization_id, 'hearings.create'));
create policy "hearings_update" on public.hearings
  for update using (public.has_permission(organization_id, 'hearings.update'))
  with check (public.has_permission(organization_id, 'hearings.update'));
create policy "hearings_delete" on public.hearings
  for delete using (public.has_permission(organization_id, 'hearings.delete'));

-- Drop a tracking entry on the matter timeline when a hearing is scheduled.
create or replace function public.track_hearing_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'hearing_scheduled',
            'Hearing scheduled: ' || new.title || ' on ' || to_char(new.hearing_at, 'Mon DD, YYYY'));
  end if;
  return new;
end $$;

create trigger trg_track_hearing_scheduled
  after insert on public.hearings for each row execute function public.track_hearing_scheduled();

-- ============================================================
-- ==> supabase/migrations/0014_tasks_staff.sql
-- ============================================================
-- ============================================================================
-- Migration 0014 — Tasks & deadlines + Staff professional profiles.
-- ============================================================================

create type public.task_status as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid references public.matters(id) on delete set null,
  title           text not null,
  description     text,
  status          public.task_status not null default 'todo',
  priority        public.task_priority not null default 'medium',
  assignee_id     uuid references public.profiles(id) on delete set null,
  due_date        date,
  completed_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tasks_org on public.tasks (organization_id);
create index idx_tasks_org_status on public.tasks (organization_id, status);
create index idx_tasks_assignee on public.tasks (assignee_id);
create index idx_tasks_matter on public.tasks (matter_id);
create index idx_tasks_due on public.tasks (organization_id, due_date);

create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

create policy "tasks_select" on public.tasks
  for select using (public.has_permission(organization_id, 'tasks.view'));
create policy "tasks_insert" on public.tasks
  for insert with check (public.has_permission(organization_id, 'tasks.create'));
create policy "tasks_update" on public.tasks
  for update using (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  with check (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid());
create policy "tasks_delete" on public.tasks
  for delete using (public.has_permission(organization_id, 'tasks.delete'));

-- Track tasks on the matter timeline.
create or replace function public.track_task_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'task_added',
            'Task added: ' || new.title);
  end if;
  return new;
end $$;

create or replace function public.track_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null and new.status = 'done' and old.status is distinct from 'done' then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, auth.uid(), 'task_completed', 'Task completed: ' || new.title);
  end if;
  return new;
end $$;

create trigger trg_track_task_created
  after insert on public.tasks for each row execute function public.track_task_created();
create trigger trg_track_task_completed
  after update on public.tasks for each row execute function public.track_task_completed();

-- ----------------------------------------------------------------------------
-- Staff professional profiles (firm-specific details for each member).
-- ----------------------------------------------------------------------------
create table public.staff_profiles (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  bar_number      text,
  year_admitted   int,
  qualifications  text[] not null default '{}',
  specializations text[] not null default '{}',
  hourly_rate     numeric(12,2),
  bio             text,
  availability    text not null default 'available', -- available | busy | on_leave
  phone           text,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create trigger trg_staff_profiles_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

alter table public.staff_profiles enable row level security;

create policy "staff_profiles_select" on public.staff_profiles
  for select using (public.has_permission(organization_id, 'staff.view'));
create policy "staff_profiles_write" on public.staff_profiles
  for all using (public.has_permission(organization_id, 'staff.manage') or user_id = auth.uid())
  with check (public.has_permission(organization_id, 'staff.manage') or user_id = auth.uid());

-- ============================================================
-- ==> supabase/migrations/0015_avatars_member_admin.sql
-- ============================================================
-- ============================================================================
-- Migration 0015 — Staff avatars + member management helpers.
-- ============================================================================

-- Can the current user manage the target user? (has staff.manage in an org the
-- target belongs to). Used to authorise setting another member's avatar.
create or replace function public.can_manage_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = target
      and public.has_permission(m.organization_id, 'staff.manage')
  );
$$;

grant execute on function public.can_manage_member(uuid) to authenticated;

-- Set a profile avatar. Allowed for yourself, a staff-manager of the target, or
-- a platform admin. profiles RLS only lets a user update their own row, so this
-- SECURITY DEFINER function is how managers set a colleague's photo.
create or replace function public.set_avatar(p_user uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user <> auth.uid() and not public.can_manage_member(p_user) and not public.is_platform_admin() then
    raise exception 'Not allowed to update this profile' using errcode = '42501';
  end if;
  update public.profiles set avatar_url = p_url where id = p_user;
end;
$$;

grant execute on function public.set_avatar(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Avatars storage bucket (public read; scoped writes). Path: <user_id>/<file>.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_select" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_member(((storage.foldername(name))[1])::uuid)
    )
  );

create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_member(((storage.foldername(name))[1])::uuid)
    )
  );

create policy "avatars_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_manage_member(((storage.foldername(name))[1])::uuid)
    )
  );

-- ============================================================
-- ==> supabase/migrations/0016_billing.sql
-- ============================================================
-- ============================================================================
-- Migration 0016 — Billing: time entries, expenses, invoices, payments.
-- ============================================================================

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'void');

-- Time entries (billable hours) --------------------------------------------
create table public.time_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid references public.matters(id) on delete set null,
  user_id         uuid references public.profiles(id) on delete set null,
  work_date       date not null default current_date,
  minutes         integer not null check (minutes > 0),
  rate            numeric(12,2) not null default 0,
  description     text not null,
  billable        boolean not null default true,
  invoiced        boolean not null default false,
  invoice_id      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_time_entries_org on public.time_entries (organization_id);
create index idx_time_entries_matter on public.time_entries (matter_id);
create index idx_time_entries_unbilled on public.time_entries (organization_id, invoiced) where billable and not invoiced;
create trigger trg_time_entries_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

-- Expenses ------------------------------------------------------------------
create table public.expenses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid references public.matters(id) on delete set null,
  user_id         uuid references public.profiles(id) on delete set null,
  expense_date    date not null default current_date,
  amount          numeric(12,2) not null check (amount >= 0),
  description     text not null,
  category        text,
  billable        boolean not null default true,
  invoiced        boolean not null default false,
  invoice_id      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_expenses_org on public.expenses (organization_id);
create index idx_expenses_matter on public.expenses (matter_id);
create trigger trg_expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- Invoices ------------------------------------------------------------------
create table public.invoice_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  year int not null,
  seq int not null default 0,
  primary key (organization_id, year)
);

create table public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number  text,
  client_id       uuid references public.clients(id) on delete set null,
  matter_id       uuid references public.matters(id) on delete set null,
  status          public.invoice_status not null default 'draft',
  issue_date      date not null default current_date,
  due_date        date,
  subtotal        numeric(12,2) not null default 0,
  tax             numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  amount_paid     numeric(12,2) not null default 0,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, invoice_number)
);
create index idx_invoices_org on public.invoices (organization_id);
create index idx_invoices_client on public.invoices (client_id);
create trigger trg_invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create table public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  kind            text not null default 'manual', -- time | expense | manual
  description     text not null,
  quantity        numeric(12,2) not null default 1,
  unit            text,
  rate            numeric(12,2) not null default 0,
  amount          numeric(12,2) not null default 0,
  created_at      timestamptz not null default now()
);
create index idx_invoice_items_invoice on public.invoice_items (invoice_id);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  amount          numeric(12,2) not null check (amount > 0),
  method          text,
  reference       text,
  paid_at         date not null default current_date,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_payments_invoice on public.payments (invoice_id);

-- Invoice numbering ---------------------------------------------------------
create or replace function public.assign_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare y int := extract(year from now())::int; n int;
begin
  if new.invoice_number is not null and new.invoice_number <> '' then return new; end if;
  insert into public.invoice_counters (organization_id, year, seq)
    values (new.organization_id, y, 1)
    on conflict (organization_id, year) do update set seq = public.invoice_counters.seq + 1
    returning seq into n;
  new.invoice_number := 'INV-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end $$;
create trigger trg_invoices_number before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- Keep invoice.amount_paid + status in sync with payments -------------------
create or replace function public.recalc_invoice_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); paid numeric; tot numeric; st public.invoice_status;
begin
  select coalesce(sum(amount),0) into paid from public.payments where invoice_id = inv;
  select total, status into tot, st from public.invoices where id = inv;
  update public.invoices
    set amount_paid = paid,
        status = case
          when st = 'void' then 'void'
          when tot > 0 and paid >= tot then 'paid'
          when st = 'paid' and paid < tot then 'sent'
          else st end
    where id = inv;
  return null;
end $$;
create trigger trg_recalc_invoice_payment
  after insert or delete on public.payments
  for each row execute function public.recalc_invoice_payment();

-- Timeline entry when an invoice is raised on a matter ----------------------
create or replace function public.track_invoice_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'invoice_created',
            'Invoice raised');
  end if;
  return new;
end $$;
create trigger trg_track_invoice_created after insert on public.invoices
  for each row execute function public.track_invoice_created();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.time_entries enable row level security;
alter table public.expenses enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy "time_entries_select" on public.time_entries
  for select using (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid());
create policy "time_entries_write" on public.time_entries
  for all using (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  with check (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid());

create policy "expenses_select" on public.expenses
  for select using (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid());
create policy "expenses_write" on public.expenses
  for all using (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  with check (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid());

create policy "invoices_select" on public.invoices
  for select using (public.has_permission(organization_id, 'billing.view'));
create policy "invoices_write" on public.invoices
  for all using (public.has_permission(organization_id, 'invoices.manage'))
  with check (public.has_permission(organization_id, 'invoices.manage'));

create policy "invoice_items_select" on public.invoice_items
  for select using (public.has_permission(organization_id, 'billing.view'));
create policy "invoice_items_write" on public.invoice_items
  for all using (public.has_permission(organization_id, 'invoices.manage'))
  with check (public.has_permission(organization_id, 'invoices.manage'));

create policy "payments_select" on public.payments
  for select using (public.has_permission(organization_id, 'billing.view'));
create policy "payments_write" on public.payments
  for all using (public.has_permission(organization_id, 'payments.manage'))
  with check (public.has_permission(organization_id, 'payments.manage'));

-- ----------------------------------------------------------------------------
-- Generate an invoice from unbilled billable work.
-- ----------------------------------------------------------------------------
create or replace function public.generate_invoice(
  p_org uuid,
  p_client uuid,
  p_matter uuid default null,
  p_due_date date default null,
  p_tax_rate numeric default 0
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
  sub numeric := 0;
  tax_amt numeric := 0;
begin
  if not public.has_permission(p_org, 'invoices.manage') then
    raise exception 'Not allowed to create invoices' using errcode = '42501';
  end if;

  insert into public.invoices (organization_id, client_id, matter_id, status, due_date, created_by)
  values (p_org, p_client, p_matter, 'draft', p_due_date, auth.uid())
  returning * into inv;

  -- Time entries -> items
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select t.organization_id, inv.id, 'time',
         coalesce(t.description, 'Legal services'),
         round(t.minutes / 60.0, 2), 'hrs', t.rate,
         round(t.minutes / 60.0 * t.rate, 2)
  from public.time_entries t
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (p_matter is not null and t.matter_id = p_matter
         or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client));

  update public.time_entries t set invoiced = true, invoice_id = inv.id
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (p_matter is not null and t.matter_id = p_matter
         or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client));

  -- Expenses -> items
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select e.organization_id, inv.id, 'expense', coalesce(e.description, 'Expense'), 1, null, e.amount, e.amount
  from public.expenses e
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (p_matter is not null and e.matter_id = p_matter
         or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client));

  update public.expenses e set invoiced = true, invoice_id = inv.id
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (p_matter is not null and e.matter_id = p_matter
         or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client));

  select coalesce(sum(amount), 0) into sub from public.invoice_items where invoice_id = inv.id;
  tax_amt := round(sub * coalesce(p_tax_rate, 0) / 100.0, 2);

  update public.invoices set subtotal = sub, tax = tax_amt, total = sub + tax_amt where id = inv.id
  returning * into inv;

  perform public.log_audit(p_org, 'invoice.created', 'invoice', inv.id, 'Generated ' || inv.invoice_number);
  return inv;
end;
$$;

grant execute on function public.generate_invoice(uuid, uuid, uuid, date, numeric) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0017_support_sessions_logos.sql
-- ============================================================
-- ============================================================================
-- Migration 0017 — Support Mode (audited firm access) + organization logos.
-- ============================================================================

create table public.support_sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admin_id        uuid references public.profiles(id) on delete set null,
  reason          text,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  ended_at        timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_support_sessions_org on public.support_sessions (organization_id, started_at desc);

alter table public.support_sessions enable row level security;

-- Platform staff and the firm's own admins can see support history (transparency).
create policy "support_sessions_select" on public.support_sessions
  for select using (public.is_platform_admin() or public.is_org_admin(organization_id));

-- Start a 30-minute support session (platform staff only). Audit-logged.
create or replace function public.start_support_session(p_org uuid, p_reason text)
returns public.support_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.support_sessions;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform staff can start a support session' using errcode = '42501';
  end if;
  insert into public.support_sessions (organization_id, admin_id, reason, expires_at)
  values (p_org, auth.uid(), p_reason, now() + interval '30 minutes')
  returning * into s;
  perform public.log_audit(p_org, 'support.session_started', 'support_session', s.id,
    'Support session started', jsonb_build_object('reason', p_reason));
  return s;
end;
$$;

create or replace function public.end_support_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform staff can end a support session' using errcode = '42501';
  end if;
  update public.support_sessions set ended_at = now() where id = p_id and ended_at is null
    returning organization_id into org;
  if org is not null then
    perform public.log_audit(org, 'support.session_ended', 'support_session', p_id, 'Support session ended');
  end if;
end;
$$;

grant execute on function public.start_support_session(uuid, text) to authenticated;
grant execute on function public.end_support_session(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Organization logos (public bucket; firm admins manage their own).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

create policy "org_logos_select" on storage.objects
  for select using (bucket_id = 'org-logos');
create policy "org_logos_insert" on storage.objects
  for insert with check (bucket_id = 'org-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));
create policy "org_logos_update" on storage.objects
  for update using (bucket_id = 'org-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));
create policy "org_logos_delete" on storage.objects
  for delete using (bucket_id = 'org-logos' and public.is_org_admin(((storage.foldername(name))[1])::uuid));

-- ============================================================
-- ==> supabase/migrations/0018_platform_users_settings.sql
-- ============================================================
-- ============================================================================
-- Migration 0018 — Platform Users (CloudTech staff roles) + Platform Settings.
-- ============================================================================

alter table public.profiles add column platform_role text;

-- Grant/adjust/revoke platform access (platform staff only).
create or replace function public.set_platform_access(p_user uuid, p_role text, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform staff can manage platform access' using errcode = '42501';
  end if;
  if p_user = auth.uid() and not p_is_admin then
    raise exception 'You cannot revoke your own platform access';
  end if;
  update public.profiles
    set is_platform_admin = p_is_admin,
        platform_role = case when p_is_admin then p_role else null end
    where id = p_user;
end;
$$;

grant execute on function public.set_platform_access(uuid, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Platform settings — a single global-config row.
-- ----------------------------------------------------------------------------
create table public.platform_settings (
  id                 boolean primary key default true,
  product_name       text not null default 'CloudTech Legal Suite',
  support_email      text,
  primary_color      text not null default '#B38A3E',
  allow_org_creation boolean not null default true,
  default_trial_days integer not null default 14,
  maintenance_mode   boolean not null default false,
  maintenance_message text,
  global_notice      text,
  feature_flags      jsonb not null default '{}'::jsonb,
  smtp               jsonb not null default '{}'::jsonb,
  updated_at         timestamptz not null default now(),
  constraint platform_settings_singleton check (id)
);

insert into public.platform_settings (id) values (true) on conflict do nothing;

create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

-- Any authenticated user may read (branding, maintenance banner); platform writes.
create policy "platform_settings_select" on public.platform_settings
  for select using (auth.role() = 'authenticated');
create policy "platform_settings_write" on public.platform_settings
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ============================================================
-- ==> supabase/migrations/0019_support_tickets.sql
-- ============================================================
-- ============================================================================
-- Migration 0019 — Support Tickets (firm-raised, platform-managed) + threads.
-- ============================================================================

create type public.ticket_status as enum ('open', 'in_progress', 'waiting', 'resolved', 'closed');
create type public.ticket_priority as enum ('low', 'medium', 'high', 'urgent');

-- Per-year running counter for human-friendly ticket numbers (platform-wide).
create table public.ticket_counters (
  year int primary key,
  seq  int not null default 0
);

create table public.support_tickets (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  ticket_number      text,
  subject            text not null,
  status             public.ticket_status not null default 'open',
  priority           public.ticket_priority not null default 'medium',
  created_by         uuid references public.profiles(id) on delete set null,
  assignee_id        uuid references public.profiles(id) on delete set null,
  support_session_id uuid references public.support_sessions(id) on delete set null,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_support_tickets_org on public.support_tickets (organization_id, created_at desc);
create index idx_support_tickets_status on public.support_tickets (status, priority);

create trigger trg_support_tickets_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- Assign TKT-<year>-<seq> on insert.
create or replace function public.assign_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  if new.ticket_number is not null and new.ticket_number <> '' then
    return new;
  end if;
  insert into public.ticket_counters (year, seq)
    values (y, 1)
    on conflict (year) do update set seq = public.ticket_counters.seq + 1
    returning seq into n;
  new.ticket_number := 'TKT-' || y || '-' || lpad(n::text, 4, '0');
  return new;
end;
$$;

create trigger trg_support_tickets_number
  before insert on public.support_tickets
  for each row execute function public.assign_ticket_number();

-- Stamp/clear resolved_at as status crosses the resolved boundary.
create or replace function public.stamp_ticket_resolved()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger trg_support_tickets_resolved
  before update of status on public.support_tickets
  for each row execute function public.stamp_ticket_resolved();

-- Threaded replies ----------------------------------------------------------
create table public.support_ticket_messages (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.support_tickets(id) on delete cascade,
  author_id     uuid references public.profiles(id) on delete set null,
  from_platform boolean not null default false,
  body          text not null,
  created_at    timestamptz not null default now()
);

create index idx_ticket_messages_ticket on public.support_ticket_messages (ticket_id, created_at);

-- Stamp the sender's side server-side (client input is not trusted) and
-- surface new replies by bumping the parent ticket's updated_at.
create or replace function public.prepare_ticket_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id := auth.uid();
  new.from_platform := public.is_platform_admin();
  update public.support_tickets set updated_at = now() where id = new.ticket_id;
  return new;
end;
$$;

create trigger trg_ticket_messages_prepare
  before insert on public.support_ticket_messages
  for each row execute function public.prepare_ticket_message();

-- RLS ------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.ticket_counters enable row level security;
-- ticket_counters: only touched via the SECURITY DEFINER trigger; no policies.

create policy "support_tickets_select" on public.support_tickets
  for select using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "support_tickets_insert" on public.support_tickets
  for insert with check (public.is_platform_admin() or public.is_org_member(organization_id));

-- Platform staff triage; firm members may also update their own firm's tickets
-- (e.g. close a request that resolved itself).
create policy "support_tickets_update" on public.support_tickets
  for update using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "ticket_messages_select" on public.support_ticket_messages
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (public.is_platform_admin() or public.is_org_member(t.organization_id))
    )
  );

create policy "ticket_messages_insert" on public.support_ticket_messages
  for insert with check (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (public.is_platform_admin() or public.is_org_member(t.organization_id))
    )
  );

-- ============================================================
-- ==> supabase/migrations/0020_billable_requires_matter.sql
-- ============================================================
-- ============================================================================
-- Migration 0020 — Billable work must be linked to a matter.
-- Invoices sweep unbilled work via the matter → client link, so a billable
-- entry with no matter can never be invoiced (it inflates WIP forever).
-- NOT VALID: existing orphaned rows are tolerated (the UI flags them);
-- all new/updated rows are enforced.
-- ============================================================================

alter table public.time_entries
  add constraint time_entries_billable_needs_matter
  check (not billable or matter_id is not null) not valid;

alter table public.expenses
  add constraint expenses_billable_needs_matter
  check (not billable or matter_id is not null) not valid;

-- ============================================================
-- ==> supabase/migrations/0021_audit_log_scoping.sql
-- ============================================================
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

-- ============================================================
-- ==> supabase/migrations/0022_matter_events_extended.sql
-- ============================================================
-- ============================================================================
-- Migration 0022 — Extend matter_events to cover hearings, tasks and invoices.
-- MatterTimeline already anticipates kind: 'hearing_scheduled' | 'task_added' |
-- 'task_completed' | 'invoice_created' (see EVENT_ICON in matter-timeline.tsx)
-- but nothing has written those kinds yet. Same trigger pattern as 0012, so the
-- timeline stays complete regardless of which client (RPC, direct write,
-- future import tooling) created the row.
-- ============================================================================

create or replace function public.track_hearing_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'hearing_scheduled',
            'Scheduled hearing: ' || new.title || ' on ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI'),
            jsonb_build_object('hearing_id', new.id));
  end if;
  return new;
end $$;

create or replace function public.track_task_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'task_added',
            'Added task: ' || new.title, jsonb_build_object('task_id', new.id));
  end if;
  return new;
end $$;

create or replace function public.track_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null and new.status = 'done' and old.status is distinct from 'done' then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, auth.uid(), 'task_completed',
            'Completed task: ' || new.title, jsonb_build_object('task_id', new.id));
  end if;
  return new;
end $$;

create or replace function public.track_invoice_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'invoice_created',
            'Invoice created for ' || to_char(new.total, 'FM999,999,990.00'),
            jsonb_build_object('invoice_id', new.id));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_hearing_scheduled on public.hearings;
create trigger trg_track_hearing_scheduled
  after insert on public.hearings for each row execute function public.track_hearing_scheduled();

drop trigger if exists trg_track_task_added on public.tasks;
create trigger trg_track_task_added
  after insert on public.tasks for each row execute function public.track_task_added();

drop trigger if exists trg_track_task_completed on public.tasks;
create trigger trg_track_task_completed
  after update on public.tasks for each row execute function public.track_task_completed();

drop trigger if exists trg_track_invoice_created on public.invoices;
create trigger trg_track_invoice_created
  after insert on public.invoices for each row execute function public.track_invoice_created();

-- ----------------------------------------------------------------------------
-- Realtime: stream matter_events for the live Timeline tab. RLS still applies
-- (matter_events_select scopes by has_permission(org, 'matters.view')).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matter_events'
  ) then
    alter publication supabase_realtime add table public.matter_events;
  end if;
end $$;

-- ============================================================
-- ==> supabase/migrations/0023_documents_overhaul.sql
-- ============================================================
-- ============================================================================
-- Migration 0023 — Documents overhaul: friendly display names + a
-- document_renamed Timeline event.
--
-- `name` (the original uploaded filename) stays immutable — it's the identity
-- tied to storage. `display_name` is the new user-facing, editable label,
-- backfilled from `name` for existing rows.
-- ============================================================================

alter table public.documents add column if not exists display_name text;
update public.documents set display_name = name where display_name is null;
alter table public.documents alter column display_name set not null;

create or replace function public.track_document_renamed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.matter_id is not null and old.display_name is distinct from new.display_name then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, auth.uid(), 'document_renamed',
            'Renamed document to ' || new.display_name, jsonb_build_object('document_id', new.id));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_document_renamed on public.documents;
create trigger trg_track_document_renamed
  after update on public.documents for each row execute function public.track_document_renamed();

-- ============================================================
-- ==> supabase/migrations/0024_time_entries_overhaul.sql
-- ============================================================
-- ============================================================================
-- Migration 0024 — Time entries overhaul: workflow status, audit trail, and a
-- rank-based lock/reopen mechanism.
--
-- Status coexists with the existing invoiced/invoice_id columns rather than
-- replacing them — generate_invoice() is untouched and keeps setting those
-- exactly as before; two triggers bridge the new status to that mechanism.
-- ============================================================================

create type public.time_entry_status as enum ('draft', 'submitted', 'approved', 'invoiced', 'paid');

alter table public.time_entries
  add column if not exists status public.time_entry_status not null default 'draft',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- Backfill: legacy rows were real, invoice-eligible entries, not drafts.
update public.time_entries set status = 'approved' where status = 'draft' and not invoiced;
update public.time_entries set status = 'invoiced' where invoiced;
update public.time_entries t
  set status = 'paid'
  from public.invoices i
  where t.invoice_id = i.id and t.status = 'invoiced' and i.status = 'paid';

update public.time_entries set created_by = user_id, updated_by = user_id where created_by is null;

create index if not exists idx_time_entries_status on public.time_entries (organization_id, status);
create index if not exists idx_time_entries_org_date on public.time_entries (organization_id, work_date);

-- ----------------------------------------------------------------------------
-- Keep status in sync with the existing invoiced/paid mechanisms.
-- ----------------------------------------------------------------------------
create or replace function public.sync_time_entry_status_on_invoiced()
returns trigger language plpgsql as $$
begin
  if new.invoiced and not old.invoiced then
    new.status := 'invoiced';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_time_entry_status on public.time_entries;
create trigger trg_sync_time_entry_status
  before update on public.time_entries
  for each row execute function public.sync_time_entry_status_on_invoiced();

create or replace function public.cascade_invoice_status_to_time_entries()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    update public.time_entries set status = 'paid' where invoice_id = new.id and status = 'invoiced';
  elsif old.status = 'paid' and new.status is distinct from 'paid' then
    update public.time_entries set status = 'invoiced' where invoice_id = new.id and status = 'paid';
  end if;
  return new;
end $$;

drop trigger if exists trg_cascade_invoice_status_to_time_entries on public.invoices;
create trigger trg_cascade_invoice_status_to_time_entries
  after update of status on public.invoices
  for each row execute function public.cascade_invoice_status_to_time_entries();

-- ----------------------------------------------------------------------------
-- Audit: created_by/updated_by, trusted server-side (not from client input).
-- ----------------------------------------------------------------------------
create or replace function public.track_time_entry_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_by := coalesce(new.updated_by, new.created_by);
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_time_entries_actor on public.time_entries;
create trigger trg_time_entries_actor
  before insert or update on public.time_entries
  for each row execute function public.track_time_entry_actor();

-- ----------------------------------------------------------------------------
-- Rank-based "Partner or above" helper — no rank-based authorization exists
-- anywhere yet; everything else in this schema is permission-key-based.
-- ----------------------------------------------------------------------------
create or replace function public.member_rank(org uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select r.rank
  from public.memberships m
  join public.roles r on r.id = m.role_id
  where m.user_id = auth.uid() and m.organization_id = org and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_partner_or_above(org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_platform_admin() or coalesce(public.member_rank(org) <= 20, false);
$$;

grant execute on function public.member_rank(uuid) to authenticated;
grant execute on function public.is_partner_or_above(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS: split the single "for all" write policy so the lock only constrains
-- update/delete (a brand-new row is never locked), and only Partner-or-above
-- can touch an invoiced/paid row.
-- ----------------------------------------------------------------------------
drop policy if exists "time_entries_write" on public.time_entries;

create policy "time_entries_insert" on public.time_entries
  for insert
  with check (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid());

create policy "time_entries_update" on public.time_entries
  for update
  using (
    (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  )
  with check (
    (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

create policy "time_entries_delete" on public.time_entries
  for delete
  using (
    (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

-- ============================================================
-- ==> supabase/migrations/0025_notifications.sql
-- ============================================================
-- ============================================================================
-- Migration 0025 — Notification Center Foundation.
--
-- Replaces the localStorage "seen" hack (platform-notifications.tsx) and the
-- audit_logs-as-notifications approach (notifications-page.tsx's old "Live
-- activity" panel) with a real per-user notifications table, populated by
-- triggers on the same write paths that already produce matter_events/
-- audit_logs entries — one event at a time, not a generic cross-table engine.
--
-- Recipient rule used throughout: notify the matter's lead_lawyer_id when
-- someone else acts on their matter (document/invoice/note), notify the
-- submitter when their own work gets approved (time entry), notify the newly
-- assigned lawyer on matter assignment. No recipient (null lead_lawyer_id, or
-- actor == recipient) simply means no row is inserted — not an error.
-- ============================================================================

create type public.notification_priority as enum ('info', 'reminder', 'warning', 'urgent');
create type public.notification_category as enum
  ('matters', 'clients', 'hearings', 'billing', 'tasks', 'documents', 'notes');

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  category        public.notification_category not null,
  action          text not null,
  entity_type     text,
  entity_id       uuid,
  title           text not null,
  priority        public.notification_priority not null default 'info',
  is_read         boolean not null default false,
  read_at         timestamptz,
  is_archived     boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_notifications_user_active on public.notifications (user_id, is_archived, created_at desc);
create index idx_notifications_user_unread on public.notifications (user_id, is_read) where not is_archived;

create table public.notification_preferences (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled  boolean not null default true,
  browser_enabled boolean not null default false,
  email_enabled   boolean not null default false,
  sms_enabled     boolean not null default false,
  updated_at      timestamptz not null default now()
);

create trigger trg_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- notify_user — insert-only RPC, mirrors log_audit's shape. This is the *only*
-- way a row can land in notifications; there is no insert policy below, so a
-- user can never forge a notification for themselves or anyone else.
-- ----------------------------------------------------------------------------
create or replace function public.notify_user(
  p_org uuid,
  p_user uuid,
  p_actor uuid,
  p_category public.notification_category,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.notifications;
begin
  if p_user is null then
    return null;
  end if;
  insert into public.notifications
    (organization_id, user_id, actor_id, category, action, entity_type, entity_id, title, priority)
  values
    (p_org, p_user, p_actor, p_category, p_action, p_entity_type, p_entity_id, p_title, p_priority)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.notify_user(
  uuid, uuid, uuid, public.notification_category, text, text, uuid, text, public.notification_priority
) to authenticated;

-- ----------------------------------------------------------------------------
-- mark_all_notifications_read — bulk update, still scoped to the caller.
-- ----------------------------------------------------------------------------
create or replace function public.mark_all_notifications_read(p_org uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.notifications
    set is_read = true, read_at = now()
    where organization_id = p_org and user_id = auth.uid() and not is_read;
$$;

grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_delete" on public.notifications
  for delete using (user_id = auth.uid());

create policy "notification_preferences_select" on public.notification_preferences
  for select using (user_id = auth.uid());
create policy "notification_preferences_insert" on public.notification_preferences
  for insert with check (user_id = auth.uid());
create policy "notification_preferences_update" on public.notification_preferences
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Event triggers — the bounded, per-event set from the Foundation plan.
-- ----------------------------------------------------------------------------

-- 1. Matter assigned -----------------------------------------------------
create or replace function public.notify_matter_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  changed boolean;
begin
  if tg_op = 'INSERT' then
    changed := new.lead_lawyer_id is not null;
  else
    changed := new.lead_lawyer_id is not null and new.lead_lawyer_id is distinct from old.lead_lawyer_id;
  end if;

  if changed and (auth.uid() is null or new.lead_lawyer_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_user(new.organization_id, new.lead_lawyer_id, auth.uid(), 'matters', 'matter.assigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' assigned you to ' || new.title, 'info');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_matter_assigned on public.matters;
create trigger trg_notify_matter_assigned
  after insert or update of lead_lawyer_id on public.matters
  for each row execute function public.notify_matter_assigned();

-- 2. Document uploaded ----------------------------------------------------
create or replace function public.notify_document_uploaded()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  lead uuid;
  uploader uuid := coalesce(new.uploaded_by, auth.uid());
begin
  if new.matter_id is null then return new; end if;
  select lead_lawyer_id into lead from public.matters where id = new.matter_id;
  if lead is null or lead = uploader then return new; end if;
  select full_name into actor_name from public.profiles where id = uploader;
  perform public.notify_user(new.organization_id, lead, uploader, 'documents', 'document.uploaded',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' uploaded ' || new.display_name, 'info');
  return new;
end $$;

drop trigger if exists trg_notify_document_uploaded on public.documents;
create trigger trg_notify_document_uploaded
  after insert on public.documents
  for each row execute function public.notify_document_uploaded();

-- 3. Invoice created --------------------------------------------------------
create or replace function public.notify_invoice_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  lead uuid;
  creator uuid := coalesce(new.created_by, auth.uid());
begin
  if new.matter_id is null then return new; end if;
  select lead_lawyer_id into lead from public.matters where id = new.matter_id;
  if lead is null or lead = creator then return new; end if;
  select full_name into actor_name from public.profiles where id = creator;
  perform public.notify_user(new.organization_id, lead, creator, 'billing', 'invoice.created',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' created invoice ' || new.invoice_number, 'info');
  return new;
end $$;

drop trigger if exists trg_notify_invoice_created on public.invoices;
create trigger trg_notify_invoice_created
  after insert on public.invoices
  for each row execute function public.notify_invoice_created();

-- 4. Invoice paid -----------------------------------------------------------
create or replace function public.notify_invoice_paid()
returns trigger language plpgsql security definer set search_path = public as $$
declare lead uuid;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.matter_id is not null then
    select lead_lawyer_id into lead from public.matters where id = new.matter_id;
    if lead is not null then
      perform public.notify_user(new.organization_id, lead, auth.uid(), 'billing', 'invoice.paid',
        'matter', new.matter_id, 'Invoice ' || new.invoice_number || ' was paid in full', 'reminder');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_invoice_paid on public.invoices;
create trigger trg_notify_invoice_paid
  after update of status on public.invoices
  for each row execute function public.notify_invoice_paid();

-- 5. Time entry approved -----------------------------------------------------
create or replace function public.notify_time_entry_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.status = 'approved' and old.status is distinct from 'approved'
     and new.user_id is not null and (auth.uid() is null or new.user_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_user(new.organization_id, new.user_id, auth.uid(), 'billing', 'time_entry.approved',
      'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' approved your time entry: ' || left(new.description, 60), 'info');
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_time_entry_approved on public.time_entries;
create trigger trg_notify_time_entry_approved
  after update of status on public.time_entries
  for each row execute function public.notify_time_entry_approved();

-- 6. Note added ---------------------------------------------------------------
create or replace function public.notify_note_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  lead uuid;
  matter_title text;
  author uuid := coalesce(new.author_id, auth.uid());
begin
  select lead_lawyer_id, title into lead, matter_title from public.matters where id = new.matter_id;
  if lead is null or lead = author then return new; end if;
  select full_name into actor_name from public.profiles where id = author;
  perform public.notify_user(new.organization_id, lead, author, 'notes', 'note.added',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' added a note on ' || matter_title, 'info');
  return new;
end $$;

drop trigger if exists trg_notify_note_added on public.matter_notes;
create trigger trg_notify_note_added
  after insert on public.matter_notes
  for each row execute function public.notify_note_added();

-- ----------------------------------------------------------------------------
-- Realtime: stream notifications for the bell/badge and browser push.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ============================================================
-- ==> supabase/migrations/0026_must_change_password.sql
-- ============================================================
-- Force a password change on next login for accounts seated with a
-- temporary password (admin-create-user sets this true for freshly created
-- accounts; it's cleared the moment the user successfully sets their own
-- password, via the forced change screen or a normal recovery reset).
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ============================================================
-- ==> supabase/migrations/0027_simplify_hard_delete.sql
-- ============================================================
-- ============================================================================
-- Migration 0027 — Simplify hard_delete_organization.
--
-- 0008 had this function reach into auth.users with a raw DELETE to clean up
-- login accounts that existed only for the deleted firm. auth.users is owned
-- by Supabase's supabase_auth_admin, not the role migrations run as — that
-- raw DELETE is exactly why "Delete forever" failed for any organization
-- that still had members (an empty org hit 0 rows there and happily
-- succeeded, masking the bug). Account cleanup now happens via the Auth
-- Admin API from the hard-delete-organization Edge Function *before* this
-- runs. This RPC goes back to doing one thing it actually has the
-- privileges for: remove the (already-trashed) organization row, cascading
-- through every org-scoped table exactly as before.
-- ============================================================================
create or replace function public.hard_delete_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can delete organizations' using errcode = '42501';
  end if;
  delete from public.organizations where id = p_org and deleted_at is not null;
end;
$$;

grant execute on function public.hard_delete_organization(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0028_fix_document_removed_cascade.sql
-- ============================================================
-- ============================================================================
-- Migration 0028 — Fix track_document_removed during cascading deletes.
--
-- trg_track_document_removed (0012) fires AFTER DELETE on documents and logs
-- a matter_events row using OLD.organization_id / OLD.matter_id. That's fine
-- for a standalone document deletion, but when the document is being removed
-- as part of a larger cascade (deleting its matter, or the whole
-- organization via hard_delete_organization), the organization and/or matter
-- row it's about to reference has *already* been deleted earlier in that
-- same cascading DELETE statement — so the INSERT trips
-- matter_events_organization_id_fkey (or _matter_id_fkey), aborting the
-- whole delete. This is exactly what broke "Delete forever" after 0027
-- fixed the auth.users issue.
--
-- Fix: only log when the organization and matter this event would reference
-- are still actually there. A genuine standalone document removal always
-- has both present; a cascading wipe of either does not, and the event
-- would be meaningless anyway (it — and everything else about that matter
-- or org — is being deleted in the same breath).
-- ============================================================================
create or replace function public.track_document_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.matter_id is not null
     and exists (select 1 from public.organizations where id = old.organization_id)
     and exists (select 1 from public.matters where id = old.matter_id)
  then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (old.organization_id, old.matter_id, auth.uid(), 'document_removed', 'Removed ' || old.name);
  end if;
  return old;
end $$;

-- ============================================================
-- ==> supabase/migrations/0029_client_contact_person.sql
-- ============================================================
-- ============================================================================
-- Migration 0029 — Primary contact person for corporate clients.
--
-- Corporate clients previously only had a single email/phone with no
-- indication of whose they were. Adds a distinct named contact (name, title,
-- email, phone) alongside the existing company-level email/phone — optional,
-- and equally usable for an individual client's secondary contact if ever
-- needed, though the UI only surfaces it for corporate.
-- ============================================================================

alter table public.clients
  add column if not exists contact_name text,
  add column if not exists contact_title text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

-- ============================================================
-- ==> supabase/migrations/0030_matter_access_control.sql
-- ============================================================
-- ============================================================================
-- Migration 0030 — P1 security fix: matter-level access control.
--
-- Every policy on matters and its child tables (documents, matter_notes,
-- matter_events, hearings, tasks, time_entries, expenses, invoices,
-- invoice_items, payments) previously gated only on an org-wide permission
-- (`has_permission(org, 'matters.view')` etc.) — anyone holding that
-- permission saw and could edit EVERY matter in the firm, forever, whether
-- or not they were ever assigned to it, and removing them from a matter did
-- nothing. This migration adds real row-level authorization: a matter is
-- visible/editable only to its lead lawyer, explicitly assigned lawyers,
-- org admins/owners, or `matters.view_all` holders — enforced entirely in
-- RLS, not the frontend, so every surface (list, dashboard, search,
-- calendar, reports) narrows automatically with no application code change.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New permission: matters.view_all — "see every matter, not just mine."
--    managing_partner/partner already get every permission via the existing
--    leadership cross-join grant; finance needs it explicitly for firm-wide
--    billing visibility. Platform roles are covered separately below.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description) values
  ('matters.view_all', 'matters', 'view_all', 'View every matter in the firm, not just assigned ones')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'matters.view_all'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner', 'finance')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. matter_assignments — additive to lead_lawyer_id, not a replacement.
--    A matter's authorized fee-earners are its lead lawyer PLUS everyone
--    with a row here.
-- ----------------------------------------------------------------------------
create table public.matter_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (matter_id, user_id)
);

create index idx_matter_assignments_matter on public.matter_assignments (matter_id);
create index idx_matter_assignments_user on public.matter_assignments (user_id);

-- ----------------------------------------------------------------------------
-- 3. has_matter_access — single source of truth, composes the existing
--    has_permission/is_org_admin helpers (which already cover
--    is_platform_admin() internally) with lead_lawyer_id and assignments.
-- ----------------------------------------------------------------------------
create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matters m
    where m.id = p_matter
      and public.has_permission(m.organization_id, 'matters.view')
      and (
        public.is_org_admin(m.organization_id)
        or public.has_permission(m.organization_id, 'matters.view_all')
        or m.lead_lawyer_id = auth.uid()
        or exists (
          select 1 from public.matter_assignments ma
          where ma.matter_id = m.id and ma.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.has_matter_access(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Safety net #1 — whoever opens a matter always keeps access to it, even
--    if they don't set themselves as lead lawyer.
-- ----------------------------------------------------------------------------
create or replace function public.grant_matter_creator_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.matter_assignments (organization_id, matter_id, user_id, assigned_by)
    values (new.organization_id, new.id, new.created_by, new.created_by)
    on conflict (matter_id, user_id) do nothing;
  end if;
  return new;
end $$;

create trigger trg_grant_matter_creator_access
  after insert on public.matters
  for each row execute function public.grant_matter_creator_access();

-- ----------------------------------------------------------------------------
-- 5. Safety net #2 — backfill existing matters with no lead lawyer (the same
--    condition that caused the Reports "Active Matters shows 0" bug) so this
--    migration doesn't retroactively lock their creator out.
-- ----------------------------------------------------------------------------
insert into public.matter_assignments (organization_id, matter_id, user_id, assigned_by)
select m.organization_id, m.id, m.created_by, m.created_by
from public.matters m
where m.lead_lawyer_id is null and m.created_by is not null
on conflict (matter_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 6. matter_assignments RLS.
-- ----------------------------------------------------------------------------
alter table public.matter_assignments enable row level security;

create policy "matter_assignments_select" on public.matter_assignments
  for select using (public.has_matter_access(matter_id));

create policy "matter_assignments_insert" on public.matter_assignments
  for insert with check (
    public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign')
  );

create policy "matter_assignments_delete" on public.matter_assignments
  for delete using (
    public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign')
  );

-- ----------------------------------------------------------------------------
-- 7. Tighten RLS — matters.
-- ----------------------------------------------------------------------------
drop policy if exists "matters_select" on public.matters;
create policy "matters_select" on public.matters
  for select using (public.has_matter_access(id));

drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (public.has_permission(organization_id, 'matters.update') and public.has_matter_access(id))
  with check (public.has_permission(organization_id, 'matters.update') and public.has_matter_access(id));

drop policy if exists "matters_delete" on public.matters;
create policy "matters_delete" on public.matters
  for delete using (public.has_permission(organization_id, 'matters.delete') and public.has_matter_access(id));
-- matters_insert is unchanged — a new row has no id to check access against yet.

-- ----------------------------------------------------------------------------
-- 8. matter_notes.
-- ----------------------------------------------------------------------------
drop policy if exists "matter_notes_select" on public.matter_notes;
create policy "matter_notes_select" on public.matter_notes
  for select using (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_notes_insert" on public.matter_notes;
create policy "matter_notes_insert" on public.matter_notes
  for insert with check (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_notes_delete" on public.matter_notes;
create policy "matter_notes_delete" on public.matter_notes
  for delete using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 9. documents (matter_id is nullable — a "general" document stays reachable
--    by anyone who could see it today; only matter-linked ones get scoped).
-- ----------------------------------------------------------------------------
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    public.has_permission(organization_id, 'documents.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (
    public.has_permission(organization_id, 'documents.upload')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update
  using (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    public.has_permission(organization_id, 'documents.delete')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- Storage objects mirror the documents table's matter scoping via a join —
-- the folder-based org check stays as the first line of defense, this adds
-- the matter-level check for objects that belong to a matter-linked document.
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view')
    and not exists (
      select 1 from public.documents d
      where d.storage_path = name
        and d.matter_id is not null
        and not public.has_matter_access(d.matter_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 10. matter_events (the timeline — always matter-linked, never nullable).
-- ----------------------------------------------------------------------------
drop policy if exists "matter_events_select" on public.matter_events;
create policy "matter_events_select" on public.matter_events
  for select using (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_events_insert" on public.matter_events;
create policy "matter_events_insert" on public.matter_events
  for insert with check (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_events_delete" on public.matter_events;
create policy "matter_events_delete" on public.matter_events
  for delete using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or actor_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 11. hearings (matter_id nullable — firm-wide hearings stay unrestricted).
-- ----------------------------------------------------------------------------
drop policy if exists "hearings_select" on public.hearings;
create policy "hearings_select" on public.hearings
  for select using (
    public.has_permission(organization_id, 'hearings.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "hearings_insert" on public.hearings;
create policy "hearings_insert" on public.hearings
  for insert with check (
    public.has_permission(organization_id, 'hearings.create')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "hearings_update" on public.hearings;
create policy "hearings_update" on public.hearings
  for update
  using (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "hearings_delete" on public.hearings;
create policy "hearings_delete" on public.hearings
  for delete using (
    public.has_permission(organization_id, 'hearings.delete')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- 12. tasks (matter_id nullable; self-assignment no longer bypasses scoping).
-- ----------------------------------------------------------------------------
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (
    public.has_permission(organization_id, 'tasks.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.has_permission(organization_id, 'tasks.create')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    public.has_permission(organization_id, 'tasks.delete')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- 13. time_entries (matter_id nullable; supersedes 0016's select policy and
--     0024's insert/update/delete split — same shape, matter scoping added).
-- ----------------------------------------------------------------------------
drop policy if exists "time_entries_select" on public.time_entries;
create policy "time_entries_select" on public.time_entries
  for select using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert" on public.time_entries
  for insert with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update" on public.time_entries
  for update
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries
  for delete using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

-- ----------------------------------------------------------------------------
-- 14. expenses (matter_id nullable).
-- ----------------------------------------------------------------------------
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses
  for select using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "expenses_write" on public.expenses;
create policy "expenses_write" on public.expenses
  for all
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 15. invoices (matter_id nullable — a client-level invoice with no matter
--     stays reachable by any billing.view holder, matching Reports' existing
--     documented boundary for matter-less invoices).
-- ----------------------------------------------------------------------------
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (
    public.has_permission(organization_id, 'billing.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices
  for all
  using (
    public.has_permission(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_permission(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- 16. invoice_items / payments — no matter_id of their own; join through
--     invoices.matter_id.
-- ----------------------------------------------------------------------------
drop policy if exists "invoice_items_select" on public.invoice_items;
create policy "invoice_items_select" on public.invoice_items
  for select using (
    public.has_permission(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "invoice_items_write" on public.invoice_items;
create policy "invoice_items_write" on public.invoice_items
  for all
  using (
    public.has_permission(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_permission(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    public.has_permission(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments
  for all
  using (
    public.has_permission(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_permission(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 17. Audit trail — mirrors the existing track_matter_status pattern
--     (0012_matter_tracking.sql).
-- ----------------------------------------------------------------------------
create or replace function public.track_matter_lead_lawyer_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_name text;
  new_name text;
begin
  if new.lead_lawyer_id is distinct from old.lead_lawyer_id then
    select full_name into new_name from public.profiles where id = new.lead_lawyer_id;
    if old.lead_lawyer_id is null then
      insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
      values (new.organization_id, new.id, auth.uid(), 'lead_lawyer_assigned',
        'Assigned ' || coalesce(new_name, 'someone') || ' as lead lawyer',
        jsonb_build_object('from', old.lead_lawyer_id, 'to', new.lead_lawyer_id));
    else
      select full_name into old_name from public.profiles where id = old.lead_lawyer_id;
      insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
      values (new.organization_id, new.id, auth.uid(), 'lead_lawyer_changed',
        'Lead Lawyer changed from ' || coalesce(old_name, '—') || ' to ' || coalesce(new_name, 'nobody'),
        jsonb_build_object('from', old.lead_lawyer_id, 'to', new.lead_lawyer_id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_track_matter_lead_lawyer_changed on public.matters;
create trigger trg_track_matter_lead_lawyer_changed
  after update of lead_lawyer_id on public.matters
  for each row execute function public.track_matter_lead_lawyer_changed();

create or replace function public.track_matter_assignment_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  user_name text;
  m_number text;
begin
  select full_name into actor_name from public.profiles where id = coalesce(new.assigned_by, auth.uid());
  select full_name into user_name from public.profiles where id = new.user_id;
  select matter_number into m_number from public.matters where id = new.matter_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, coalesce(new.assigned_by, auth.uid()), 'lawyer_assigned',
    coalesce(actor_name, 'Someone') || ' assigned ' || coalesce(user_name, 'a team member')
      || ' to Matter ' || coalesce(m_number, ''),
    jsonb_build_object('user_id', new.user_id));
  return new;
end $$;

drop trigger if exists trg_track_matter_assignment_added on public.matter_assignments;
create trigger trg_track_matter_assignment_added
  after insert on public.matter_assignments
  for each row execute function public.track_matter_assignment_added();

create or replace function public.track_matter_assignment_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  user_name text;
  m_number text;
begin
  select full_name into actor_name from public.profiles where id = auth.uid();
  select full_name into user_name from public.profiles where id = old.user_id;
  select matter_number into m_number from public.matters where id = old.matter_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'lawyer_removed',
    coalesce(actor_name, 'Someone') || ' removed ' || coalesce(user_name, 'a team member')
      || ' from Matter ' || coalesce(m_number, ''),
    jsonb_build_object('user_id', old.user_id));
  return old;
end $$;

drop trigger if exists trg_track_matter_assignment_removed on public.matter_assignments;
create trigger trg_track_matter_assignment_removed
  after delete on public.matter_assignments
  for each row execute function public.track_matter_assignment_removed();

-- ----------------------------------------------------------------------------
-- 18. Notify newly-assigned team members (lead-lawyer notification already
--     exists in 0025_notifications.sql and needs no change — it looks up
--     lead_lawyer_id fresh at each event, so a removed lead simply stops
--     being notified with no code change).
-- ----------------------------------------------------------------------------
create or replace function public.notify_matter_team_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  actor uuid := coalesce(new.assigned_by, auth.uid());
begin
  if actor is not null and new.user_id = actor then return new; end if;
  select full_name into actor_name from public.profiles where id = actor;
  select title into matter_title from public.matters where id = new.matter_id;
  perform public.notify_user(new.organization_id, new.user_id, actor, 'matters', 'matter.assigned',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' assigned you to ' || coalesce(matter_title, 'a matter'), 'info');
  return new;
end $$;

drop trigger if exists trg_notify_matter_team_assigned on public.matter_assignments;
create trigger trg_notify_matter_team_assigned
  after insert on public.matter_assignments
  for each row execute function public.notify_matter_team_assigned();

-- ============================================================
-- ==> supabase/migrations/0031_matter_access_creator_fix.sql
-- ============================================================
-- ============================================================================
-- Migration 0031 — Fix "Could not save matter" introduced by 0030.
--
-- `.insert().select()` (used by mattersService.create) runs as a single
-- INSERT ... RETURNING statement. Postgres applies the table's SELECT RLS
-- policy to that RETURNING output, and it does so as each row is processed —
-- BEFORE any AFTER ROW trigger for that same statement fires. has_matter_access
-- previously granted a matter's creator access only via the
-- grant_matter_creator_access trigger inserting a matter_assignments row,
-- which hadn't run yet at the moment RETURNING was evaluated. Net effect:
-- creating a matter succeeded at the INSERT, then failed on the immediate
-- read-back — for every user, including org admins in some paths, whenever
-- the row-return timing lost the race.
--
-- Fixed by checking matters.created_by directly inside has_matter_access,
-- with no dependency on trigger timing. The trigger (and the
-- matter_assignments row it writes) stays — it's what makes the creator show
-- up in the "Assigned team" UI — this just makes RLS correct independent of it.
-- ============================================================================

create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matters m
    where m.id = p_matter
      and public.has_permission(m.organization_id, 'matters.view')
      and (
        public.is_org_admin(m.organization_id)
        or public.has_permission(m.organization_id, 'matters.view_all')
        or m.lead_lawyer_id = auth.uid()
        or m.created_by = auth.uid()
        or exists (
          select 1 from public.matter_assignments ma
          where ma.matter_id = m.id and ma.user_id = auth.uid()
        )
      )
  );
$$;

-- ============================================================
-- ==> supabase/migrations/0032_matter_trigger_idempotency_fix.sql
-- ============================================================
-- ============================================================================
-- Migration 0032 — Make trg_grant_matter_creator_access safe to re-run.
--
-- Every other new trigger added in 0030 has a `drop trigger if exists` guard
-- before it (matching this codebase's established idempotent-migration
-- pattern, e.g. 0022's fix for the same class of bug); this one was missed.
-- Postgres has no `CREATE TRIGGER IF NOT EXISTS`, so if 0030 was ever applied
-- more than once against the same database (a partial-failure retry, or a
-- second manual paste into the SQL editor), the second run would fail with
-- "trigger already exists" on this exact statement and abort.
-- ============================================================================

drop trigger if exists trg_grant_matter_creator_access on public.matters;
create trigger trg_grant_matter_creator_access
  after insert on public.matters
  for each row execute function public.grant_matter_creator_access();

-- ============================================================
-- ==> supabase/migrations/0033_fix_assignment_removed_cascade.sql
-- ============================================================
-- ============================================================================
-- Migration 0033 — Fix track_matter_assignment_removed during cascading
-- matter deletion. Same class of bug as 0028's track_document_removed fix.
--
-- trg_track_matter_assignment_removed (0030) fires AFTER DELETE on
-- matter_assignments and logs a matter_events row using OLD.organization_id
-- / OLD.matter_id. That's fine for a standalone unassignment (the matter
-- still exists), but matter_assignments.matter_id references matters(id)
-- ON DELETE CASCADE — so deleting a matter cascades into deleting its
-- matter_assignments rows too, firing this trigger while the matter row
-- it's about to reference is already gone, tripping
-- matter_events_matter_id_fkey and aborting the whole delete.
--
-- Fix: only log when the organization and matter this event would reference
-- are still actually there. A genuine standalone unassignment always has
-- both present; a cascading matter deletion does not, and the event would
-- be meaningless anyway — matter_events for that matter is being deleted in
-- the same breath (matter_events.matter_id is also ON DELETE CASCADE).
-- ============================================================================

create or replace function public.track_matter_assignment_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  user_name text;
  m_number text;
begin
  if exists (select 1 from public.organizations where id = old.organization_id)
     and exists (select 1 from public.matters where id = old.matter_id)
  then
    select full_name into actor_name from public.profiles where id = auth.uid();
    select full_name into user_name from public.profiles where id = old.user_id;
    select matter_number into m_number from public.matters where id = old.matter_id;
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (old.organization_id, old.matter_id, auth.uid(), 'lawyer_removed',
      coalesce(actor_name, 'Someone') || ' removed ' || coalesce(user_name, 'a team member')
        || ' from Matter ' || coalesce(m_number, ''),
      jsonb_build_object('user_id', old.user_id));
  end if;
  return old;
end $$;

-- The RLS-test matter this same failure left half-deleted (its
-- matter_assignments row is already gone via cascade; only the matters row
-- itself remains) — clean it up now that the trigger won't block it.
delete from public.matters where title = 'RLS TEST — DELETE ME';

-- ============================================================
-- ==> supabase/migrations/0034_matter_row_access_fix.sql
-- ============================================================
-- ============================================================================
-- Migration 0034 — Fix has_matter_access() being unusable on the matters
-- table's own policies.
--
-- has_matter_access(matter_id) works by re-querying `matters` from inside
-- itself — correct and necessary for every CHILD table (documents, tasks,
-- etc.), where matter_id points to a matter that already exists from an
-- earlier, separate transaction. But matters_select/update/delete used the
-- SAME function on the matters table itself, which is self-referential: RLS
-- checks (including the implicit SELECT-policy check on an INSERT's
-- RETURNING clause) run within the same command as any write to that row,
-- and a fresh nested SELECT re-scanning matters from that same command
-- cannot see a row that command is in the middle of inserting — Postgres
-- table scans use a stable snapshot from the start of the command, and only
-- a CTE's own output (not a fresh re-query of the underlying table) can see
-- a row written earlier in the same statement. Net effect: has_matter_access
-- always found zero matching rows for a just-created matter and returned
-- false, for every user, regardless of role or permissions — confirmed via
-- a live diagnostic showing is_org_admin/created_by both true while
-- has_matter_access still returned false for the exact same row.
--
-- Fixed by checking access directly against the row's own column values —
-- which RLS provides directly in USING/WITH CHECK with no subquery needed —
-- instead of re-fetching the row. has_matter_access() itself is unchanged
-- and remains correct for every child table's policies.
-- ============================================================================

create or replace function public.matter_row_access(
  p_org uuid,
  p_lead_lawyer uuid,
  p_created_by uuid,
  p_matter uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'matters.view')
    and (
      public.is_org_admin(p_org)
      or public.has_permission(p_org, 'matters.view_all')
      or p_lead_lawyer = auth.uid()
      or p_created_by = auth.uid()
      or exists (
        select 1 from public.matter_assignments ma
        where ma.matter_id = p_matter and ma.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.matter_row_access(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists "matters_select" on public.matters;
create policy "matters_select" on public.matters
  for select using (public.matter_row_access(organization_id, lead_lawyer_id, created_by, id));

drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (public.has_permission(organization_id, 'matters.update') and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id))
  with check (public.has_permission(organization_id, 'matters.update') and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id));

drop policy if exists "matters_delete" on public.matters;
create policy "matters_delete" on public.matters
  for delete using (public.has_permission(organization_id, 'matters.delete') and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id));

-- Clean up the two RLS-test rows left by our diagnostic session, if present.
delete from public.matters where title = 'RLS TEST — DELETE ME';

-- ============================================================
-- ==> supabase/migrations/0035_notify_matter_unassigned.sql
-- ============================================================
-- ============================================================================
-- Migration 0035 — Notify a team member when they're removed from a matter.
--
-- Mirrors notify_matter_team_assigned (0030) for the removal case, so
-- someone finds out why a matter disappeared from their list instead of it
-- just silently vanishing. Same cascade-safety guard as
-- track_matter_assignment_removed (0033) — skip when the matter itself is
-- being deleted in the same breath (removal from a matter that no longer
-- exists at all isn't a meaningful "you were removed" event, and matches
-- the existing "no notification about a matter that's gone" behavior).
-- ============================================================================

create or replace function public.notify_matter_team_unassigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
begin
  if not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;
  if auth.uid() is not null and old.user_id = auth.uid() then
    return old; -- someone removing themselves doesn't need telling
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select title into matter_title from public.matters where id = old.matter_id;
  perform public.notify_user(old.organization_id, old.user_id, auth.uid(), 'matters', 'matter.unassigned',
    'matter', old.matter_id,
    coalesce(actor_name, 'Someone') || ' removed you from ' || coalesce(matter_title, 'a matter'), 'warning');
  return old;
end $$;

drop trigger if exists trg_notify_matter_team_unassigned on public.matter_assignments;
create trigger trg_notify_matter_team_unassigned
  after delete on public.matter_assignments
  for each row execute function public.notify_matter_team_unassigned();

-- ============================================================
-- ==> supabase/migrations/0036_notify_lead_lawyer_removed.sql
-- ============================================================
-- ============================================================================
-- Migration 0036 — Notify the outgoing lead lawyer, not just the incoming one.
--
-- notify_matter_assigned (0025) only ever notified the NEW lead_lawyer_id.
-- Reassigning a matter's Lead Lawyer field away from someone is a separate
-- code path from removing them via the "Assigned team" list (0035 covers
-- that one) — this was the other half of the same gap, and the actual
-- one being tested: the matter in question always had its lead lawyer set
-- via the Edit Matter form, not the team card, so 0035's trigger never had
-- anything to fire on.
-- ============================================================================

create or replace function public.notify_matter_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
  unassigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.lead_lawyer_id is not null;
    unassigned := false;
  else
    assigned := new.lead_lawyer_id is not null and new.lead_lawyer_id is distinct from old.lead_lawyer_id;
    unassigned := old.lead_lawyer_id is not null and old.lead_lawyer_id is distinct from new.lead_lawyer_id;
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();

  if assigned and (auth.uid() is null or new.lead_lawyer_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, new.lead_lawyer_id, auth.uid(), 'matters', 'matter.assigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' assigned you to ' || new.title, 'info');
  end if;

  if unassigned and (auth.uid() is null or old.lead_lawyer_id <> auth.uid()) then
    perform public.notify_user(new.organization_id, old.lead_lawyer_id, auth.uid(), 'matters', 'matter.unassigned',
      'matter', new.id, coalesce(actor_name, 'Someone') || ' removed you as lead lawyer on ' || new.title, 'warning');
  end if;

  return new;
end $$;

-- ============================================================
-- ==> supabase/migrations/0037_client_delete_cascades_matters.sql
-- ============================================================
-- ============================================================================
-- Migration 0037 — Deleting a client now cascades to delete its matters.
--
-- matters.client_id was `on delete set null` — deleting a client silently
-- orphaned its matters (client link went blank, matter survived) with no
-- warning in the UI. Per explicit product decision: a deleted client should
-- take its matters with it.
--
-- This reuses the existing matter-deletion cascade rules exactly as they
-- already work when a matter is deleted directly from the Matters page —
-- documents/notes/timeline-events/hearings/team-assignments are hard
-- deleted (on delete cascade), while tasks/time_entries/expenses/invoices
-- are detached but preserved (on delete set null). No new cascade behavior
-- is introduced for those child tables; only the top-level
-- client -> matter link changes from "detach" to "cascade".
--
-- invoices.client_id (client-level invoices with no matter_id) is left
-- untouched — those are financial/billing records, a different category
-- from case files, and weren't part of this request.
--
-- Safety check: only managing_partner/partner/platform roles hold
-- clients.delete in the seed (0003) — the same roles that hold
-- matters.view_all by default (0030) — so this cascade introduces no
-- privilege escalation: nobody gains the ability to destroy a matter they
-- couldn't already fully see and manage.
-- ============================================================================

alter table public.matters drop constraint if exists matters_client_id_fkey;
alter table public.matters
  add constraint matters_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete cascade;

-- ============================================================
-- ==> supabase/migrations/0038_client_dedup_and_contacts.sql
-- ============================================================
-- ============================================================================
-- Migration 0038 — Client validation, duplicate detection, multiple contacts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. pg_trgm — trigram similarity, the standard Postgres tool for fuzzy text
--    matching. Not enabled anywhere in this project before now.
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 2. client_contacts — replaces the single flat "primary contact" fields
--    added in 0029. A corporate client can now have any number of contacts.
-- ----------------------------------------------------------------------------
create table public.client_contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  name            text not null,
  title           text,
  email           text,
  phone           text,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index idx_client_contacts_client on public.client_contacts (client_id);
-- At most one primary contact per client.
create unique index idx_client_contacts_one_primary on public.client_contacts (client_id) where is_primary;

alter table public.client_contacts enable row level security;

create policy "client_contacts_select" on public.client_contacts
  for select using (public.has_permission(organization_id, 'clients.view'));
create policy "client_contacts_insert" on public.client_contacts
  for insert with check (
    public.has_permission(organization_id, 'clients.update')
    or public.has_permission(organization_id, 'clients.create')
  );
create policy "client_contacts_update" on public.client_contacts
  for update using (public.has_permission(organization_id, 'clients.update'))
  with check (public.has_permission(organization_id, 'clients.update'));
create policy "client_contacts_delete" on public.client_contacts
  for delete using (public.has_permission(organization_id, 'clients.update'));

-- Backfill: every client with a "primary contact" set under the old flat
-- columns gets one client_contacts row carrying that data forward.
insert into public.client_contacts (organization_id, client_id, name, title, email, phone, is_primary)
select organization_id, id, contact_name, contact_title, contact_email, contact_phone, true
from public.clients
where contact_name is not null and trim(contact_name) <> '';

-- The flat columns are now fully superseded — no reason to maintain two
-- parallel contact-storage mechanisms.
alter table public.clients
  drop column if exists contact_name,
  drop column if exists contact_title,
  drop column if exists contact_email,
  drop column if exists contact_phone;

-- ----------------------------------------------------------------------------
-- 3. Registration number — new field, enforced uniqueness per org.
--    Comparison is case/whitespace-insensitive; the stored value keeps
--    whatever casing was typed.
-- ----------------------------------------------------------------------------
alter table public.clients add column if not exists registration_number text;

create unique index if not exists idx_clients_registration_number
  on public.clients (organization_id, lower(trim(registration_number)))
  where registration_number is not null;

-- ----------------------------------------------------------------------------
-- 4. Duplicate detection RPC. Compares against clients.display_name (already
--    the canonical name for both individual and corporate clients) rather
--    than re-deriving type-specific name logic in SQL.
--
--    exact  := normalized display_name equality, OR exact email match,
--              OR exact registration_number match.
--    similar := trigram name similarity >= 0.35 (Postgres's own `%` operator
--               defaults to 0.3; slightly stricter here to cut noise), OR
--               exact phone match — evaluated only when not already exact.
-- ----------------------------------------------------------------------------
create or replace function public.find_similar_clients(
  p_org uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_registration_number text default null,
  p_exclude_id uuid default null
)
returns table (id uuid, display_name text, type public.client_type, match_type text, score real)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.display_name,
    c.type,
    case
      when lower(trim(c.display_name)) = lower(trim(p_name)) then 'exact'
      when p_email is not null and trim(p_email) <> '' and lower(trim(c.email)) = lower(trim(p_email)) then 'exact'
      when p_registration_number is not null and trim(p_registration_number) <> ''
        and lower(trim(c.registration_number)) = lower(trim(p_registration_number)) then 'exact'
      else 'similar'
    end as match_type,
    greatest(
      similarity(lower(trim(c.display_name)), lower(trim(p_name))),
      case when p_phone is not null and trim(p_phone) <> '' and lower(trim(c.phone)) = lower(trim(p_phone))
        then 1.0 else 0.0 end
    ) as score
  from public.clients c
  where c.organization_id = p_org
    and public.has_permission(p_org, 'clients.view')
    and (p_exclude_id is null or c.id <> p_exclude_id)
    and (
      lower(trim(c.display_name)) = lower(trim(p_name))
      or (p_email is not null and trim(p_email) <> '' and lower(trim(c.email)) = lower(trim(p_email)))
      or (p_registration_number is not null and trim(p_registration_number) <> ''
          and lower(trim(c.registration_number)) = lower(trim(p_registration_number)))
      or similarity(lower(trim(c.display_name)), lower(trim(p_name))) >= 0.35
      or (p_phone is not null and trim(p_phone) <> '' and lower(trim(c.phone)) = lower(trim(p_phone)))
    )
  order by (case when lower(trim(c.display_name)) = lower(trim(p_name)) then 0 else 1 end) asc, score desc
  limit 5;
$$;

grant execute on function public.find_similar_clients(uuid, text, text, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. clients.create_duplicate — overrides a "similar match" warning only
--    (exact matches are never overridable). Seeded to leadership/platform
--    roles only, matching how clients.delete is already scoped.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description) values
  ('clients.create_duplicate', 'clients', 'create_duplicate', 'Create a client despite a similar-match warning')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.create_duplicate'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0039_client_permission_model.sql
-- ============================================================
-- ============================================================================
-- Migration 0039 — Separate client permissions from matter permissions;
-- tighten client editing to leadership by default.
--
-- Client visibility was already firm-wide before this migration —
-- clients_select (0010) has always been a plain org-wide has_permission
-- check, never matter-scoped; only matters and its child tables were
-- touched by 0030's matter-level access-control work. That part of the
-- request was already true; this migration is entirely about WHO can
-- create/edit/delete client records, plus decoupling contact management
-- into its own permission. Matter permissions are not touched at all.
-- ============================================================================

-- 1. New permission: managing contacts is now separate from editing the
--    client record itself, so it can be granted independently later
--    without touching application code.
insert into public.permissions (key, resource, action, description) values
  ('clients.manage_contacts', 'clients', 'manage_contacts', 'Add, edit, remove and set the primary client contact')
on conflict (key) do nothing;

-- Seeded explicitly (the leadership cross-join in 0003 only ran once, at
-- that migration's original execution — new permissions added afterward
-- need their own grant, same as matters.view_all (0030) and
-- clients.create_duplicate (0038) did).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.manage_contacts'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- 2. Fee-earners (senior/associate/junior associate) become read-only for
--    clients — creating and editing client records is now leadership-only.
--    They keep clients.view (unchanged) and everything matter-related
--    (unchanged) — this is scoped to clients.create/clients.update only.
delete from public.role_permissions
where role_id in (select id from public.roles where key in ('senior_associate', 'associate', 'junior_associate'))
  and permission_id in (select id from public.permissions where key in ('clients.create', 'clients.update'));

-- 3. Partner keeps Create/Read/Update but not Delete — only Managing
--    Partner can delete a client. Partner still gets every other
--    permission via the leadership cross-join (0003); this is a single
--    targeted revoke, not a re-scope of the whole role.
delete from public.role_permissions
where role_id in (select id from public.roles where key = 'partner')
  and permission_id in (select id from public.permissions where key = 'clients.delete');

-- 4. client_contacts write access now keyed on clients.manage_contacts
--    instead of clients.update/clients.create — contact management is its
--    own permission (though both default to the same roles today). Viewing
--    stays on clients.view (0038, unchanged) — "if you can view the
--    client, you can view its contacts," independent of matter access.
drop policy if exists "client_contacts_insert" on public.client_contacts;
create policy "client_contacts_insert" on public.client_contacts
  for insert with check (public.has_permission(organization_id, 'clients.manage_contacts'));

drop policy if exists "client_contacts_update" on public.client_contacts;
create policy "client_contacts_update" on public.client_contacts
  for update using (public.has_permission(organization_id, 'clients.manage_contacts'))
  with check (public.has_permission(organization_id, 'clients.manage_contacts'));

drop policy if exists "client_contacts_delete" on public.client_contacts;
create policy "client_contacts_delete" on public.client_contacts
  for delete using (public.has_permission(organization_id, 'clients.manage_contacts'));

-- ============================================================
-- ==> supabase/migrations/0040_senior_associate_can_create_clients.sql
-- ============================================================
-- ============================================================================
-- Migration 0040 — Senior Associate can create clients.
--
-- 0039 read "Senior Associate: Read only by default" literally and removed
-- both clients.create and clients.update. Correction: Senior Associate keeps
-- clients.create (they can onboard new clients) but stays without
-- clients.update (editing an existing client record is still leadership-
-- only, unchanged). Associate and Junior Associate are untouched — still
-- read-only for clients, per the original request.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.create'
  and r.key = 'senior_associate'
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0041_senior_associate_can_edit_clients.sql
-- ============================================================
-- ============================================================================
-- Migration 0041 — Senior Associate can edit clients and manage contacts.
--
-- Further correction to 0039/0040: Senior Associate now gets full CRU on
-- clients (create, read, update — still no delete, which stays Managing-
-- Partner-only) plus clients.manage_contacts. Associate and Junior
-- Associate remain read-only, unchanged.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('clients.update', 'clients.manage_contacts')
  and r.key = 'senior_associate'
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0042_editable_matter_notes.sql
-- ============================================================
-- ============================================================================
-- Migration 0042 — Editable matter notes.
--
-- matter_notes only ever supported add/delete — there was no UPDATE policy
-- at all, so any edit attempt would have been silently rejected by RLS.
-- Adds updated_at/edited_by tracking (updated_at stays null until the first
-- real edit, so the UI can tell "never edited" from "edited"), an UPDATE
-- policy mirroring the existing delete policy's authorization shape
-- (author, or a matters.update holder — both still gated by
-- has_matter_access per the P1 matter-access-control work), and a
-- note_edited timeline event mirroring the existing note_added one.
-- ============================================================================

alter table public.matter_notes
  add column if not exists updated_at timestamptz,
  add column if not exists edited_by uuid references public.profiles(id) on delete set null;

drop trigger if exists trg_matter_notes_updated_at on public.matter_notes;
create trigger trg_matter_notes_updated_at
  before update on public.matter_notes
  for each row execute function public.set_updated_at();

drop policy if exists "matter_notes_update" on public.matter_notes;
create policy "matter_notes_update" on public.matter_notes
  for update
  using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
  )
  with check (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
  );

create or replace function public.track_note_edited()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.body is distinct from old.body then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (new.organization_id, new.matter_id, coalesce(new.edited_by, auth.uid()), 'note_edited',
            'Edited a note: ' || left(new.body, 80));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_note_edited on public.matter_notes;
create trigger trg_track_note_edited
  after update on public.matter_notes
  for each row execute function public.track_note_edited();

-- ============================================================
-- ==> supabase/migrations/0043_fix_matter_notes_edited_by_fkey_name.sql
-- ============================================================
-- ============================================================================
-- Migration 0043 — Ensure matter_notes' edited_by FK is named exactly
-- matter_notes_edited_by_fkey, whatever Postgres actually auto-generated.
--
-- 0042 added `edited_by uuid references public.profiles(id) ...` via
-- ALTER TABLE ADD COLUMN. matters.service.ts's listNotes() query now
-- disambiguates two FKs from matter_notes to profiles (author_id and
-- edited_by) using explicit constraint-name hints, required once a table
-- has more than one FK to the same target — PostgREST otherwise can't tell
-- which relationship you mean and rejects the whole query. If the
-- auto-generated name isn't exactly matter_notes_edited_by_fkey, that
-- rejection fails the ENTIRE notes list (not just the new column) with an
-- unresolved-relationship error — the exact symptom reported: notes exist
-- in the table but never render.
-- ============================================================================

do $$
declare
  current_name text;
begin
  select con.conname into current_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
  where rel.relname = 'matter_notes'
    and con.contype = 'f'
    and att.attname = 'edited_by';

  if current_name is not null and current_name <> 'matter_notes_edited_by_fkey' then
    execute format('alter table public.matter_notes rename constraint %I to matter_notes_edited_by_fkey', current_name);
  end if;
end $$;

-- ============================================================
-- ==> supabase/migrations/0044_task_assignment_grants_matter_access.sql
-- ============================================================
-- ============================================================================
-- Migration 0044 — Assigning a task grants matter access, notifies, and
-- records both the team addition and the task assignment on the timeline.
--
-- Without this, assigning a task on a matter to someone not already on that
-- matter's team left them with a task they could not see at all (RLS blocks
-- tasks whose matter they don't have access to) — and separately, task
-- assignment never notified anyone regardless of matter access, since it
-- was never wired into the notification system built in 0025/0030.
-- ============================================================================

-- 1. Auto-grant matter access to a task's assignee, reusing the existing
--    matter_assignments table — its own insert/notify/audit triggers
--    (0030) fire automatically, so the "team assignment" half of this is
--    zero new trigger code.
create or replace function public.grant_task_assignee_matter_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lead uuid;
  changed boolean;
begin
  if new.assignee_id is null or new.matter_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    changed := true;
  else
    changed := new.assignee_id is distinct from old.assignee_id or new.matter_id is distinct from old.matter_id;
  end if;
  if not changed then
    return new;
  end if;

  select lead_lawyer_id into lead from public.matters where id = new.matter_id;
  if lead = new.assignee_id then
    return new; -- already has access as lead lawyer
  end if;

  insert into public.matter_assignments (organization_id, matter_id, user_id, assigned_by)
  values (new.organization_id, new.matter_id, new.assignee_id, auth.uid())
  on conflict (matter_id, user_id) do nothing;

  return new;
end $$;

drop trigger if exists trg_grant_task_assignee_matter_access on public.tasks;
create trigger trg_grant_task_assignee_matter_access
  after insert or update of assignee_id, matter_id on public.tasks
  for each row execute function public.grant_task_assignee_matter_access();

-- 2. Notify the assignee about the task itself (separate from the "you were
--    added to the matter team" notification the trigger above produces).
--    Deep-links to the matter when the task has one — matches how every
--    other matter-scoped notification resolves, since there's no
--    standalone task detail page yet.
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
  end if;

  if assigned and (auth.uid() is null or new.assignee_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_user(
      new.organization_id, new.assignee_id, auth.uid(), 'tasks', 'task.assigned',
      case when new.matter_id is not null then 'matter' else 'task' end,
      coalesce(new.matter_id, new.id),
      coalesce(actor_name, 'Someone') || ' assigned you a task: ' || new.title,
      'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- 3. Timeline entry for the task assignment itself (matter-linked tasks
--    only — matter_events.matter_id is not nullable). The team-addition
--    half is already recorded automatically by track_matter_assignment_added
--    (0030) once trigger #1 above inserts the matter_assignments row.
create or replace function public.track_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assignee_name text;
  assigned boolean;
begin
  if new.matter_id is null then return new; end if;
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
  end if;
  if not assigned then return new; end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select full_name into assignee_name from public.profiles where id = new.assignee_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(), 'task_assigned',
    coalesce(actor_name, 'Someone') || ' assigned task "' || new.title || '" to ' || coalesce(assignee_name, 'someone'));
  return new;
end $$;

drop trigger if exists trg_track_task_assigned on public.tasks;
create trigger trg_track_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.track_task_assigned();

-- ============================================================
-- ==> supabase/migrations/0045_billing_enterprise_phase1.sql
-- ============================================================
-- ============================================================================
-- Migration 0045 — Billing & Invoicing enterprise readiness, Phase 1.
--
-- Status workflow (draft/sent/partial/paid/void), draft-only line-item
-- editing with server-computed totals, payment-recording guardrails, Void
-- with a mandatory reason, Delete Draft with full reversal of linked
-- time entries/expenses, a real Platform-Admin financial-record carve-out
-- anchored on the existing support_sessions table, matter-timeline entries
-- for every status change, and audit-log gaps closed on addExpense/
-- deleteExpense/addPayment. See idempotent-twirling-rose.md for the full
-- 18-section spec this implements (Phase 1 of 3).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema: partial status, discount/tax_rate/void_reason, payment notes.
-- ----------------------------------------------------------------------------
alter type public.invoice_status add value if not exists 'partial';

alter table public.invoices
  add column if not exists discount numeric(12,2) not null default 0,
  add column if not exists tax_rate numeric(5,2) not null default 0,
  add column if not exists void_reason text;

alter table public.payments
  add column if not exists notes text;

-- ----------------------------------------------------------------------------
-- 2. Platform Admin financial-record carve-out.
--
-- Every other table lets is_platform_admin() bypass permission checks
-- unconditionally (via has_permission()). Financial records are the one
-- deliberate exception: a platform admin only sees an org's invoices/
-- payments while holding an active, unexpired support_sessions row for
-- that org (the real, server-verifiable mechanism from 0017) — never by
-- default. Everyone else's access is unchanged (falls through to the
-- existing has_permission()).
-- ----------------------------------------------------------------------------
create or replace function public.has_financial_access(p_org uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin() then exists (
      select 1 from public.support_sessions s
      where s.organization_id = p_org
        and s.admin_id = auth.uid()
        and s.ended_at is null
        and s.expires_at > now()
    )
    else public.has_permission(p_org, p_perm)
  end;
$$;

grant execute on function public.has_financial_access(uuid, text) to authenticated;

-- Rewire invoices/invoice_items/payments RLS onto has_financial_access, and
-- add the draft-only status gate to invoice_items writes (today nothing
-- stops editing a *sent* invoice's line items beyond the UI simply not
-- offering it).
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (
    public.has_financial_access(organization_id, 'billing.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices
  for all
  using (
    public.has_financial_access(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_financial_access(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "invoice_items_select" on public.invoice_items;
create policy "invoice_items_select" on public.invoice_items
  for select using (
    public.has_financial_access(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "invoice_items_write" on public.invoice_items;
create policy "invoice_items_write" on public.invoice_items
  for all
  using (
    public.has_financial_access(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
        and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_financial_access(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
        and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    public.has_financial_access(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments
  for all
  using (
    public.has_financial_access(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_financial_access(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Server-side totals: recompute subtotal/tax/total whenever line items
--    change, or whenever discount/tax_rate are edited directly — never
--    trusted from the client, matching how amount_paid already works.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_invoice_tax_before_update()
returns trigger language plpgsql as $$
declare taxable numeric;
begin
  taxable := greatest(coalesce(new.subtotal, 0) - coalesce(new.discount, 0), 0);
  new.tax := round(taxable * coalesce(new.tax_rate, 0) / 100.0, 2);
  new.total := taxable + new.tax;
  return new;
end $$;

drop trigger if exists trg_recompute_invoice_tax on public.invoices;
create trigger trg_recompute_invoice_tax
  before update of discount, tax_rate on public.invoices
  for each row execute function public.recompute_invoice_tax_before_update();

create or replace function public.recompute_invoice_totals_on_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv_id uuid := coalesce(new.invoice_id, old.invoice_id);
  sub numeric;
  disc numeric;
  rate numeric;
  taxable numeric;
  tax_amt numeric;
begin
  select coalesce(sum(amount), 0) into sub from public.invoice_items where invoice_id = inv_id;
  select coalesce(discount, 0), coalesce(tax_rate, 0) into disc, rate from public.invoices where id = inv_id;
  taxable := greatest(sub - disc, 0);
  tax_amt := round(taxable * rate / 100.0, 2);
  update public.invoices set subtotal = sub, tax = tax_amt, total = taxable + tax_amt where id = inv_id;
  return null;
end $$;

drop trigger if exists trg_recompute_invoice_totals_on_items on public.invoice_items;
create trigger trg_recompute_invoice_totals_on_items
  after insert or update or delete on public.invoice_items
  for each row execute function public.recompute_invoice_totals_on_items();

-- generate_invoice() no longer computes subtotal/tax/total itself — the
-- trigger above now owns that math (it fires as each item row is
-- inserted) — it only needs to persist the chosen tax_rate up front so
-- the trigger has something to compute against.
create or replace function public.generate_invoice(
  p_org uuid,
  p_client uuid,
  p_matter uuid default null,
  p_due_date date default null,
  p_tax_rate numeric default 0
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
begin
  if not public.has_financial_access(p_org, 'invoices.manage') then
    raise exception 'Not allowed to create invoices' using errcode = '42501';
  end if;

  insert into public.invoices (organization_id, client_id, matter_id, status, due_date, tax_rate, created_by)
  values (p_org, p_client, p_matter, 'draft', p_due_date, coalesce(p_tax_rate, 0), auth.uid())
  returning * into inv;

  -- Time entries -> items
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select t.organization_id, inv.id, 'time',
         coalesce(t.description, 'Legal services'),
         round(t.minutes / 60.0, 2), 'hrs', t.rate,
         round(t.minutes / 60.0 * t.rate, 2)
  from public.time_entries t
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (p_matter is not null and t.matter_id = p_matter
         or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client));

  update public.time_entries t set invoiced = true, invoice_id = inv.id
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (p_matter is not null and t.matter_id = p_matter
         or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client));

  -- Expenses -> items
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select e.organization_id, inv.id, 'expense', coalesce(e.description, 'Expense'), 1, null, e.amount, e.amount
  from public.expenses e
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (p_matter is not null and e.matter_id = p_matter
         or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client));

  update public.expenses e set invoiced = true, invoice_id = inv.id
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (p_matter is not null and e.matter_id = p_matter
         or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client));

  select * into inv from public.invoices where id = inv.id;

  perform public.log_audit(p_org, 'invoice.created', 'invoice', inv.id, 'Generated ' || inv.invoice_number);
  return inv;
end;
$$;

grant execute on function public.generate_invoice(uuid, uuid, uuid, date, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Payment recalculation: recognize "partial", and correctly revert
--    partial/paid back to sent when payments are removed down to zero
--    (today only handles the paid -> sent case).
-- ----------------------------------------------------------------------------
create or replace function public.recalc_invoice_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); paid numeric; tot numeric; st public.invoice_status;
begin
  select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = inv;
  select total, status into tot, st from public.invoices where id = inv;
  update public.invoices
    set amount_paid = paid,
        status = case
          when st = 'void' then 'void'
          when tot > 0 and paid >= tot then 'paid'
          when paid > 0 and paid < tot then 'partial'
          when st in ('partial', 'paid') and paid <= 0 then 'sent'
          else st end
    where id = inv;
  return null;
end $$;
-- (trigger trg_recalc_invoice_payment already exists from 0016; replacing
-- the function body is enough, no need to recreate the trigger itself.)

-- Payments can only be recorded while an invoice is Sent or Partially Paid.
create or replace function public.guard_payment_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.invoice_status;
begin
  select status into st from public.invoices where id = new.invoice_id;
  if st is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if st not in ('sent', 'partial') then
    raise exception 'Payments can only be recorded on Sent or Partially Paid invoices' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_payment_invoice_status on public.payments;
create trigger trg_guard_payment_invoice_status
  before insert on public.payments
  for each row execute function public.guard_payment_invoice_status();

-- ----------------------------------------------------------------------------
-- 5. Invoice transition guard: lock line-item-adjacent fields once an
--    invoice leaves Draft, require at least one line item to Mark Sent,
--    and require a reason to Void — all as a real security boundary, not
--    just a UI affordance.
-- ----------------------------------------------------------------------------
create or replace function public.guard_invoice_transitions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'draft' and (
    new.due_date is distinct from old.due_date
    or new.discount is distinct from old.discount
    or new.tax_rate is distinct from old.tax_rate
    or new.notes is distinct from old.notes
  ) then
    raise exception 'This invoice is no longer a draft and cannot be edited' using errcode = '42501';
  end if;

  if old.status = 'draft' and new.status = 'sent' and not exists (
    select 1 from public.invoice_items where invoice_id = new.id
  ) then
    raise exception 'An invoice cannot be sent until it contains at least one billable item.' using errcode = '23514';
  end if;

  if new.status = 'void' and old.status is distinct from 'void' and coalesce(trim(new.void_reason), '') = '' then
    raise exception 'A reason is required to void an invoice' using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_invoice_transitions on public.invoices;
create trigger trg_guard_invoice_transitions
  before update on public.invoices
  for each row execute function public.guard_invoice_transitions();

-- ----------------------------------------------------------------------------
-- 6. Matter timeline entries for status changes, with the requested exact
--    wording for Sent and Void.
-- ----------------------------------------------------------------------------
create or replace function public.track_invoice_status_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  client_name text;
  summary text;
begin
  if new.status is distinct from old.status and new.matter_id is not null then
    select full_name into actor_name from public.profiles where id = auth.uid();
    select display_name into client_name from public.clients where id = new.client_id;

    summary := case new.status
      when 'sent' then coalesce(actor_name, 'Someone') || ' sent Invoice ' || coalesce(new.invoice_number, '')
        || case when client_name is not null then ' to ' || client_name else '' end || '.'
      when 'void' then coalesce(actor_name, 'Someone') || ' voided Invoice ' || coalesce(new.invoice_number, '')
        || coalesce(chr(10) || 'Reason: ' || new.void_reason, '')
      when 'paid' then 'Invoice ' || coalesce(new.invoice_number, '') || ' was paid in full.'
      when 'partial' then 'Invoice ' || coalesce(new.invoice_number, '') || ' received a partial payment.'
      else coalesce(actor_name, 'Someone') || ' changed Invoice ' || coalesce(new.invoice_number, '') || ' status to ' || new.status
    end;

    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, auth.uid(), 'invoice_status_changed', summary,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_invoice_status_changed on public.invoices;
create trigger trg_track_invoice_status_changed
  after update of status on public.invoices
  for each row execute function public.track_invoice_status_changed();

-- ----------------------------------------------------------------------------
-- 7. Delete Draft Invoice — draft-only, reverses linked time entries and
--    expenses back to Unbilled before deleting the invoice.
-- ----------------------------------------------------------------------------
create or replace function public.delete_draft_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if inv.status <> 'draft' then
    raise exception 'Only draft invoices can be deleted' using errcode = '42501';
  end if;
  if not (public.has_financial_access(inv.organization_id, 'invoices.manage')
          and (inv.matter_id is null or public.has_matter_access(inv.matter_id))) then
    raise exception 'Not authorized to delete this invoice' using errcode = '42501';
  end if;

  update public.time_entries set invoiced = false, invoice_id = null, status = 'approved'
    where invoice_id = p_invoice;
  update public.expenses set invoiced = false, invoice_id = null
    where invoice_id = p_invoice;

  if inv.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (inv.organization_id, inv.matter_id, auth.uid(), 'invoice_deleted',
      'Deleted draft invoice ' || coalesce(inv.invoice_number, ''));
  end if;

  perform public.log_audit(inv.organization_id, 'invoice.deleted', 'invoice', inv.id,
    'Deleted draft invoice ' || coalesce(inv.invoice_number, ''));

  delete from public.invoices where id = p_invoice;
end;
$$;

grant execute on function public.delete_draft_invoice(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0046_delete_any_invoice.sql
-- ============================================================
-- ============================================================================
-- Migration 0046 — Let Managing Partner (anyone holding invoices.manage,
-- which today is Managing Partner only) delete an invoice of any status, not
-- just Draft — e.g. a mistakenly-generated ₦0 invoice already marked Sent.
--
-- Replaces delete_draft_invoice() with delete_invoice(), which drops the
-- draft-only restriction but keeps every other safeguard: permission +
-- matter-access check, reversal of linked time entries/expenses back to
-- Unbilled, a matter timeline entry, and an audit log entry. Deleting a
-- Sent/Partial/Paid invoice also permanently removes its payment history
-- (invoice_items/payments both cascade via their existing FKs) — the UI
-- surfaces an explicit extra warning for that case.
-- ============================================================================

drop function if exists public.delete_draft_invoice(uuid);

create or replace function public.delete_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if not (public.has_financial_access(inv.organization_id, 'invoices.manage')
          and (inv.matter_id is null or public.has_matter_access(inv.matter_id))) then
    raise exception 'Not authorized to delete this invoice' using errcode = '42501';
  end if;

  update public.time_entries set invoiced = false, invoice_id = null, status = 'approved'
    where invoice_id = p_invoice;
  update public.expenses set invoiced = false, invoice_id = null
    where invoice_id = p_invoice;

  if inv.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (inv.organization_id, inv.matter_id, auth.uid(), 'invoice_deleted',
      'Deleted invoice ' || coalesce(inv.invoice_number, '') ||
      case when inv.status <> 'draft' then ' (was ' || inv.status || ')' else '' end);
  end if;

  perform public.log_audit(inv.organization_id, 'invoice.deleted', 'invoice', inv.id,
    'Deleted invoice ' || coalesce(inv.invoice_number, '') || ' (status was ' || inv.status || ')',
    jsonb_build_object('status', inv.status, 'total', inv.total, 'amount_paid', inv.amount_paid));

  delete from public.invoices where id = p_invoice;
end;
$$;

grant execute on function public.delete_invoice(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0047_hearing_notifications.sql
-- ============================================================
-- ============================================================================
-- Migration 0047 — Hearing notification workflow.
--
-- Every existing notify_* trigger (0025/0030/0035/0036/0044) resolves and
-- notifies exactly one recipient (usually lead_lawyer_id). Hearings need the
-- whole Matter Team — lead_lawyer_id UNION matter_assignments, the same set
-- has_matter_access() checks — so this adds the fan-out helper no existing
-- trigger needed, then wires create/modify/reschedule/cancel/delete on
-- hearings to both notify_user (in-app, via the helper) and matter_events
-- (Activity Timeline). Today hearings only get an AFTER INSERT trigger
-- (track_hearing_scheduled, 0022) — update/delete produce nothing at all.
--
-- Email is explicitly out of scope for this migration (no email-sending
-- infrastructure exists anywhere in this project yet — see
-- notification_preferences.email_enabled, a UI-only stub).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. notify_matter_team — fan out a notification to everyone with access to
--    a matter (lead lawyer + matter_assignments), skipping the actor.
--    Recipients are always a subset of has_matter_access(), so this can
--    never reach someone unrelated to the matter.
-- ----------------------------------------------------------------------------
create or replace function public.notify_matter_team(
  p_org uuid,
  p_matter uuid,
  p_actor uuid,
  p_category public.notification_category,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select m.lead_lawyer_id as user_id from public.matters m where m.id = p_matter and m.lead_lawyer_id is not null
    union
    select ma.user_id from public.matter_assignments ma where ma.matter_id = p_matter
  loop
    if p_actor is null or recipient <> p_actor then
      perform public.notify_user(p_org, recipient, p_actor, p_category, p_action, p_entity_type, p_entity_id, p_title, p_priority);
    end if;
  end loop;
end;
$$;

grant execute on function public.notify_matter_team(
  uuid, uuid, uuid, public.notification_category, text, text, uuid, text, public.notification_priority
) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. hearing_notification_title — one shared formatter so every hearing
--    notification carries the same required fields (matter, hearing title,
--    date, time, court, actor) in the same shape.
-- ----------------------------------------------------------------------------
create or replace function public.hearing_notification_title(
  p_verb text,
  p_actor_name text,
  p_matter_number text,
  p_matter_title text,
  p_hearing_title text,
  p_hearing_at timestamptz,
  p_court text
)
returns text
language sql
immutable
as $$
  select coalesce(p_actor_name, 'Someone') || ' ' || p_verb || ' a hearing on '
    || coalesce(p_matter_number, p_matter_title, 'a matter') || ': "' || p_hearing_title || '" — '
    || to_char(p_hearing_at, 'FMMon DD, YYYY HH24:MI')
    || case when p_court is not null and p_court <> '' then ', ' || p_court else '' end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Created — extend the existing AFTER INSERT trigger with the fan-out.
--    The matter_events insert is unchanged from 0022.
-- ----------------------------------------------------------------------------
create or replace function public.track_hearing_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  actor uuid := coalesce(new.created_by, auth.uid());
  title text;
begin
  if new.matter_id is not null then
    select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;
    select full_name into actor_name from public.profiles where id = actor;
    title := public.hearing_notification_title('scheduled', actor_name, matter_number, matter_title, new.title, new.hearing_at, new.court);

    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, actor, 'hearing_scheduled',
            'Scheduled hearing: ' || new.title || ' on ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI'),
            jsonb_build_object('hearing_id', new.id));

    perform public.notify_matter_team(new.organization_id, new.matter_id, actor,
      'hearings', 'hearing.scheduled', 'matter', new.matter_id, title, 'info');
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Modified / rescheduled / cancelled — entirely new. Classifies the
--    update so the wording and priority match what actually happened.
-- ----------------------------------------------------------------------------
create or replace function public.track_hearing_modified()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  title text;
  kind text;
  verb text;
  summary text;
begin
  if new.matter_id is null then return new; end if;

  if new.hearing_at is distinct from old.hearing_at then
    kind := 'hearing_rescheduled'; verb := 'rescheduled';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    kind := 'hearing_cancelled'; verb := 'cancelled';
  elsif new.title is distinct from old.title
     or new.court is distinct from old.court
     or new.judge is distinct from old.judge
     or new.location is distinct from old.location
     or new.type is distinct from old.type
     or new.status is distinct from old.status
     or new.outcome is distinct from old.outcome
     or new.notes is distinct from old.notes
     or new.duration_minutes is distinct from old.duration_minutes then
    kind := 'hearing_updated'; verb := 'updated';
  else
    return new; -- nothing meaningful changed (e.g. only updated_at)
  end if;

  select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;
  select full_name into actor_name from public.profiles where id = auth.uid();
  title := public.hearing_notification_title(verb, actor_name, matter_number, matter_title, new.title, new.hearing_at, new.court);

  summary := case kind
    when 'hearing_rescheduled' then 'Rescheduled hearing: ' || new.title || ' to ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI')
    when 'hearing_cancelled' then 'Cancelled hearing: ' || new.title || ' (was ' || to_char(old.hearing_at, 'FMMon DD, YYYY HH24:MI') || ')'
    else 'Updated hearing: ' || new.title
  end;

  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, auth.uid(), kind, summary, jsonb_build_object('hearing_id', new.id));

  perform public.notify_matter_team(new.organization_id, new.matter_id, auth.uid(),
    'hearings', 'hearing.' || replace(kind, 'hearing_', ''), 'matter', new.matter_id, title,
    case when kind = 'hearing_cancelled' then 'warning' else 'info' end);

  return new;
end $$;

drop trigger if exists trg_track_hearing_modified on public.hearings;
create trigger trg_track_hearing_modified
  after update on public.hearings
  for each row execute function public.track_hearing_modified();

-- ----------------------------------------------------------------------------
-- 5. Deleted — entirely new. Guarded against cascading matter/org deletion
--    the same way 0028's track_document_removed / 0033's
--    track_matter_assignment_removed were fixed: only log when the
--    organization and matter this event references are still actually
--    there (they won't be if this hearing is being deleted as a side
--    effect of deleting its whole matter, in the same breath).
-- ----------------------------------------------------------------------------
create or replace function public.track_hearing_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  title text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;

  select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = old.matter_id;
  select full_name into actor_name from public.profiles where id = auth.uid();
  title := public.hearing_notification_title('removed', actor_name, matter_number, matter_title, old.title, old.hearing_at, old.court);

  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'hearing_deleted',
    'Removed hearing: ' || old.title || ' (was ' || to_char(old.hearing_at, 'FMMon DD, YYYY HH24:MI') || ')',
    jsonb_build_object('hearing_id', old.id));

  perform public.notify_matter_team(old.organization_id, old.matter_id, auth.uid(),
    'hearings', 'hearing.deleted', 'matter', old.matter_id, title, 'warning');

  return old;
end $$;

drop trigger if exists trg_track_hearing_deleted on public.hearings;
create trigger trg_track_hearing_deleted
  after delete on public.hearings
  for each row execute function public.track_hearing_deleted();

-- ============================================================
-- ==> supabase/migrations/0048_expense_overhaul.sql
-- ============================================================
-- ============================================================================
-- Migration 0048 — Expense management overhaul.
--
-- Blueprint: 0024_time_entries_overhaul.sql already solved this exact shape
-- of problem for time entries (created_by/updated_by + actor trigger,
-- is_partner_or_above() for a lock-override, split "for all" RLS into
-- per-action policies with a lock condition). This replicates that pattern
-- for expenses rather than inventing a new one. is_partner_or_above()
-- already exists from 0024 and is reused verbatim, unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit columns — organization_id/matter_id already exist on expenses;
--    only created_by/updated_by are missing.
-- ----------------------------------------------------------------------------
alter table public.expenses
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.expenses set created_by = user_id, updated_by = user_id where created_by is null;

-- ----------------------------------------------------------------------------
-- 2. Trusted server-side actor stamping — not from client input, so "Logged
--    By" can't be spoofed by a disabled form field alone.
-- ----------------------------------------------------------------------------
create or replace function public.track_expense_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_by := coalesce(new.updated_by, new.created_by);
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_expenses_actor on public.expenses;
create trigger trg_expenses_actor
  before insert or update on public.expenses
  for each row execute function public.track_expense_actor();

-- ----------------------------------------------------------------------------
-- 3. Lock invoiced expenses — split the single "for all" policy so the lock
--    only constrains update/delete (a brand-new row is never locked), same
--    shape as time_entries_update/time_entries_delete in 0024. Today there
--    is zero enforcement of this anywhere (an owner can currently edit or
--    delete their own already-invoiced expense).
-- ----------------------------------------------------------------------------
drop policy if exists "expenses_write" on public.expenses;

create policy "expenses_insert" on public.expenses
  for insert
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  );

create policy "expenses_update" on public.expenses
  for update
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

create policy "expenses_delete" on public.expenses
  for delete
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

-- ----------------------------------------------------------------------------
-- 4. Activity Timeline — expenses have never written to matter_events (only
--    to audit_logs, the firm-wide log, via the service layer). New triggers,
--    same style as track_document_added/track_time_entry_actor's siblings.
-- ----------------------------------------------------------------------------
create or replace function public.track_expense_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = coalesce(new.created_by, auth.uid());
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'expense_created',
    coalesce(actor_name, 'Someone') || ' logged an expense: ₦' || new.amount || ' — ' || new.description,
    jsonb_build_object('expense_id', new.id, 'amount', new.amount));
  return new;
end $$;

drop trigger if exists trg_track_expense_created on public.expenses;
create trigger trg_track_expense_created
  after insert on public.expenses
  for each row execute function public.track_expense_created();

create or replace function public.track_expense_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null then return new; end if;
  -- Skip when nothing a person would call "an edit" changed — e.g. the
  -- invoiced/invoice_id flip generate_invoice() makes gets its own,
  -- differently-worded event via track_expense_invoiced below.
  if new.amount is not distinct from old.amount
     and new.description is not distinct from old.description
     and new.category is not distinct from old.category
     and new.expense_date is not distinct from old.expense_date
     and new.matter_id is not distinct from old.matter_id
     and new.billable is not distinct from old.billable then
    return new;
  end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (
    new.organization_id, new.matter_id, auth.uid(), 'expense_updated',
    case when new.amount is distinct from old.amount
      then coalesce(actor_name, 'Someone') || ' updated an expense — amount changed from ₦' || old.amount || ' to ₦' || new.amount
      else coalesce(actor_name, 'Someone') || ' updated an expense: ' || new.description
    end,
    jsonb_build_object('expense_id', new.id, 'from_amount', old.amount, 'to_amount', new.amount));
  return new;
end $$;

drop trigger if exists trg_track_expense_updated on public.expenses;
create trigger trg_track_expense_updated
  after update on public.expenses
  for each row execute function public.track_expense_updated();

-- Cascade-guarded the same way 0028/0033/0047 already established for this
-- exact class of bug (deleting the parent matter/org cascades here too).
create or replace function public.track_expense_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'expense_deleted',
    coalesce(actor_name, 'Someone') || ' deleted an expense: ₦' || old.amount || ' — ' || old.description,
    jsonb_build_object('expense_id', old.id, 'amount', old.amount));
  return old;
end $$;

drop trigger if exists trg_track_expense_deleted on public.expenses;
create trigger trg_track_expense_deleted
  after delete on public.expenses
  for each row execute function public.track_expense_deleted();

-- Fires when generate_invoice()'s expense sweep sets invoiced = true —
-- untouched itself; this rides its existing UPDATE.
create or replace function public.track_expense_invoiced()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; inv_number text;
begin
  if new.matter_id is null or not new.invoiced or old.invoiced then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  select invoice_number into inv_number from public.invoices where id = new.invoice_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, auth.uid(), 'expense_invoiced',
    coalesce(actor_name, 'Someone') || ' included the expense ₦' || new.amount || ' — ' || new.description
      || ' in Invoice ' || coalesce(inv_number, ''),
    jsonb_build_object('expense_id', new.id, 'invoice_id', new.invoice_id));
  return new;
end $$;

drop trigger if exists trg_track_expense_invoiced on public.expenses;
create trigger trg_track_expense_invoiced
  after update of invoiced on public.expenses
  for each row execute function public.track_expense_invoiced();

-- ----------------------------------------------------------------------------
-- 5. Void an invoice ⇒ its expenses/time entries become unbilled again, same
--    as hard-deleting one already does (delete_invoice, 0046). Today only
--    delete reverses invoiced/invoice_id; void leaves them billed forever.
--    Scoped tightly to the void transition — sent/partial/paid flows are
--    untouched.
-- ----------------------------------------------------------------------------
create or replace function public.reverse_billing_on_void()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    update public.expenses set invoiced = false, invoice_id = null where invoice_id = new.id;
    update public.time_entries set invoiced = false, invoice_id = null, status = 'approved'
      where invoice_id = new.id and status in ('invoiced', 'paid');
  end if;
  return new;
end $$;

drop trigger if exists trg_reverse_billing_on_void on public.invoices;
create trigger trg_reverse_billing_on_void
  after update of status on public.invoices
  for each row execute function public.reverse_billing_on_void();

-- ----------------------------------------------------------------------------
-- 6. Receipts — a table (not bare columns on expenses), so "replace" is
--    naturally insert-new+delete-old with history inspectable, mirroring why
--    documents is its own table rather than a column on matters. Bucket +
--    RLS clone the `documents` bucket's exact shape (private, org-folder
--    check, matter-access join-through for select).
-- ----------------------------------------------------------------------------
create table public.expense_receipts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_id      uuid not null references public.expenses(id) on delete cascade,
  storage_path    text not null,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_expense_receipts_expense on public.expense_receipts (expense_id);

alter table public.expense_receipts enable row level security;

create policy "expense_receipts_select" on public.expense_receipts
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'billing.view') or e.user_id = auth.uid())
    )
  );

create policy "expense_receipts_insert" on public.expense_receipts
  for insert with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and not e.invoiced
    )
  );

create policy "expense_receipts_delete" on public.expense_receipts
  for delete using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and (not e.invoiced or public.is_partner_or_above(e.organization_id))
    )
  );

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_storage_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.storage_path = name
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'billing.view') or e.user_id = auth.uid())
    )
  );

create policy "receipts_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'billing.view')
  );

create policy "receipts_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.storage_path = name
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and (not e.invoiced or public.is_partner_or_above(e.organization_id))
    )
  );

create or replace function public.track_receipt_uploaded()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; m_id uuid;
begin
  select matter_id into m_id from public.expenses where id = new.expense_id;
  if m_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = coalesce(new.uploaded_by, auth.uid());
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, m_id, coalesce(new.uploaded_by, auth.uid()), 'receipt_uploaded',
    coalesce(actor_name, 'Someone') || ' uploaded a receipt: ' || new.file_name,
    jsonb_build_object('expense_id', new.expense_id, 'receipt_id', new.id));
  return new;
end $$;

drop trigger if exists trg_track_receipt_uploaded on public.expense_receipts;
create trigger trg_track_receipt_uploaded
  after insert on public.expense_receipts
  for each row execute function public.track_receipt_uploaded();

-- ============================================================
-- ==> supabase/migrations/0049_payments_and_receipts.sql
-- ============================================================
-- ============================================================================
-- Migration 0049 — Payments & Receipts.
--
-- Blueprint: assign_invoice_number() (0016) for the numbering pattern,
-- print-invoice.ts for the receipt-PDF pattern (cloned client-side, not
-- here). recalc_invoice_payment() and guard_payment_invoice_status()
-- (0016/0045) are extended in place, not replaced — existing Sent → Partial
-- → Paid behavior, and everything delete_invoice() (0046) already does,
-- stays exactly as-is.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Independent record: client/matter denormalized from the invoice (never
--    independently editable — set server-side, once, at insert), a unique
--    payment number and a unique receipt number per payment.
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists matter_id uuid references public.matters(id) on delete set null,
  add column if not exists payment_number text,
  add column if not exists receipt_number text;

-- Backfill existing rows from their invoice so the unique constraints below
-- and any historical view of payments stay consistent.
update public.payments p
  set client_id = i.client_id, matter_id = i.matter_id
  from public.invoices i
  where p.invoice_id = i.id and p.client_id is null;

update public.payments
  set payment_number = 'PAY-LEGACY-' || substr(id::text, 1, 8)
  where payment_number is null;
update public.payments
  set receipt_number = 'RCT-LEGACY-' || substr(id::text, 1, 8)
  where receipt_number is null;

alter table public.payments
  add constraint uq_payments_payment_number unique (organization_id, payment_number),
  add constraint uq_payments_receipt_number unique (organization_id, receipt_number);

create table public.billing_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            text not null,
  year            int not null,
  seq             int not null default 0,
  primary key (organization_id, kind, year)
);

create or replace function public.assign_payment_receipt_numbers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now())::int;
  n_pay int;
  n_rct int;
  v_client_id uuid;
  v_matter_id uuid;
begin
  select client_id, matter_id into v_client_id, v_matter_id from public.invoices where id = new.invoice_id;
  if not found then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  new.client_id := v_client_id;
  new.matter_id := v_matter_id;

  if new.payment_number is null or new.payment_number = '' then
    insert into public.billing_counters (organization_id, kind, year, seq)
      values (new.organization_id, 'payment', y, 1)
      on conflict (organization_id, kind, year) do update set seq = public.billing_counters.seq + 1
      returning seq into n_pay;
    new.payment_number := 'PAY-' || y || '-' || lpad(n_pay::text, 4, '0');
  end if;

  if new.receipt_number is null or new.receipt_number = '' then
    insert into public.billing_counters (organization_id, kind, year, seq)
      values (new.organization_id, 'receipt', y, 1)
      on conflict (organization_id, kind, year) do update set seq = public.billing_counters.seq + 1
      returning seq into n_rct;
    new.receipt_number := 'RCT-' || y || '-' || lpad(n_rct::text, 4, '0');
  end if;

  return new;
end $$;

drop trigger if exists trg_assign_payment_receipt_numbers on public.payments;
create trigger trg_assign_payment_receipt_numbers
  before insert on public.payments
  for each row execute function public.assign_payment_receipt_numbers();

-- ----------------------------------------------------------------------------
-- 2. Overpayment guard — today only `amount > 0` is checked anywhere.
--    Extends guard_payment_invoice_status() (0045), which already fires
--    BEFORE INSERT and already fetches the invoice row; no new trigger.
-- ----------------------------------------------------------------------------
create or replace function public.guard_payment_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.invoice_status; tot numeric; paid numeric;
begin
  select status, total, amount_paid into st, tot, paid from public.invoices where id = new.invoice_id;
  if st is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if st not in ('sent', 'partial') then
    raise exception 'Payments can only be recorded on Sent or Partially Paid invoices' using errcode = '23514';
  end if;
  if new.amount > (tot - paid) then
    raise exception 'Payment of % exceeds the outstanding balance of %', new.amount, (tot - paid) using errcode = '23514';
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Editing/deleting a recorded payment needs Managing Partner, not the
--    broader payments.manage (already held by Partner and Finance too — too
--    wide for this). New permission key, seeded to managing_partner only,
--    same pattern as 0040/0041.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description)
values ('payments.void', 'payments', 'void', 'Edit or delete a recorded payment')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'payments.void'
  and r.key = 'managing_partner'
on conflict do nothing;

drop policy if exists "payments_write" on public.payments;

create policy "payments_insert" on public.payments
  for insert
  with check (
    public.has_financial_access(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

create policy "payments_update" on public.payments
  for update
  using (
    public.has_financial_access(organization_id, 'payments.void')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_financial_access(organization_id, 'payments.void')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

create policy "payments_delete" on public.payments
  for delete using (
    public.has_financial_access(organization_id, 'payments.void')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Invoice status keeps recalculating on an edited payment amount too —
--    today only insert/delete trigger the recalc (0016/0045).
-- ----------------------------------------------------------------------------
drop trigger if exists trg_recalc_invoice_payment on public.payments;
create trigger trg_recalc_invoice_payment
  after insert or update or delete on public.payments
  for each row execute function public.recalc_invoice_payment();

-- ----------------------------------------------------------------------------
-- 5. Activity Timeline. track_invoice_status_changed (0045) only fires on a
--    status *change*, so a 2nd/3rd partial payment on an already-partial
--    invoice produced no timeline entry before — this logs directly in the
--    payment path instead, every time.
-- ----------------------------------------------------------------------------
create or replace function public.track_payment_recorded()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; inv_number text; m_id uuid;
begin
  select invoice_number, matter_id into inv_number, m_id from public.invoices where id = new.invoice_id;
  if m_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = coalesce(new.created_by, auth.uid());
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, m_id, coalesce(new.created_by, auth.uid()), 'payment_recorded',
    coalesce(actor_name, 'Someone') || ' recorded a payment of ₦' || new.amount || ' on Invoice ' || coalesce(inv_number, '')
      || ' (Receipt ' || new.receipt_number || ')',
    jsonb_build_object('payment_id', new.id, 'invoice_id', new.invoice_id, 'amount', new.amount, 'receipt_number', new.receipt_number));
  return new;
end $$;

drop trigger if exists trg_track_payment_recorded on public.payments;
create trigger trg_track_payment_recorded
  after insert on public.payments
  for each row execute function public.track_payment_recorded();

create or replace function public.track_payment_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; m_id uuid;
begin
  if new.amount is not distinct from old.amount
     and new.method is not distinct from old.method
     and new.reference is not distinct from old.reference
     and new.paid_at is not distinct from old.paid_at then
    return new;
  end if;
  select matter_id into m_id from public.invoices where id = new.invoice_id;
  if m_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, m_id, auth.uid(), 'payment_updated',
    coalesce(actor_name, 'Someone') || ' edited payment ' || new.payment_number
      || ' — amount changed from ₦' || old.amount || ' to ₦' || new.amount,
    jsonb_build_object('payment_id', new.id, 'from_amount', old.amount, 'to_amount', new.amount));
  return new;
end $$;

drop trigger if exists trg_track_payment_updated on public.payments;
create trigger trg_track_payment_updated
  after update on public.payments
  for each row execute function public.track_payment_updated();

-- Cascade-guarded the same way 0028/0033/0047/0048 already established:
-- deleting the parent invoice/org cascades here too, and that path (e.g.
-- delete_invoice, 0046) already logs its own "invoice deleted" event — this
-- only fires for a genuine standalone payment deletion.
create or replace function public.track_payment_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; m_id uuid;
begin
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.invoices where id = old.invoice_id) then
    return old;
  end if;
  select matter_id into m_id from public.invoices where id = old.invoice_id;
  if m_id is null then return old; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, m_id, auth.uid(), 'payment_deleted',
    coalesce(actor_name, 'Someone') || ' deleted payment ' || old.payment_number || ' — ₦' || old.amount,
    jsonb_build_object('payment_id', old.id, 'amount', old.amount));
  return old;
end $$;

drop trigger if exists trg_track_payment_deleted on public.payments;
create trigger trg_track_payment_deleted
  after delete on public.payments
  for each row execute function public.track_payment_deleted();

-- ============================================================
-- ==> supabase/migrations/0050_closed_matter_readonly.sql
-- ============================================================
-- Closed Matter Read-Only Mode.
--
-- Once a matter reaches a terminal status (closed/won/lost — the same set
-- matters.service.ts already treats as "closing" for closed_on purposes),
-- every operational write against it or its child records is blocked at the
-- RLS/trigger level, for everyone, with no leadership exception. Read access
-- (view/download everything, including the Activity Timeline) is completely
-- unaffected. The only way back is the new reopen_matter() RPC, gated by a
-- new managing_partner-only permission, which performs the narrow status
-- flip as SECURITY DEFINER — the one deliberate bypass of the freeze below.

-- 1. Helper: is this matter currently open (or does it not exist / have no
--    matter at all, in which case the caller's own null-check applies)?
create or replace function public.matter_is_open(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status not in ('closed', 'won', 'lost') from public.matters where id = p_matter), true);
$$;

-- 2. matters_update — freeze the normal edit path once a matter is closed.
--    (matters_select/_delete/_insert are untouched; reopening bypasses this
--    via reopen_matter()'s SECURITY DEFINER update, below.)
drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (
    public.has_permission(organization_id, 'matters.update')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id)
    and status not in ('closed', 'won', 'lost')
  )
  with check (
    public.has_permission(organization_id, 'matters.update')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id)
  );

-- 3. matter_notes — insert/update/delete gated on the matter being open.
drop policy if exists "matter_notes_insert" on public.matter_notes;
create policy "matter_notes_insert" on public.matter_notes
  for insert with check (
    public.has_permission(organization_id, 'matters.view')
    and public.has_matter_access(matter_id)
    and public.matter_is_open(matter_id)
  );

drop policy if exists "matter_notes_update" on public.matter_notes;
create policy "matter_notes_update" on public.matter_notes
  for update
  using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
    and public.matter_is_open(matter_id)
  )
  with check (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
    and public.matter_is_open(matter_id)
  );

drop policy if exists "matter_notes_delete" on public.matter_notes;
create policy "matter_notes_delete" on public.matter_notes
  for delete using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
    and public.matter_is_open(matter_id)
  );

-- 4. tasks
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.has_permission(organization_id, 'tasks.create')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  )
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    public.has_permission(organization_id, 'tasks.delete')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

-- 5. documents (table)
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (
    public.has_permission(organization_id, 'documents.upload')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update
  using (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  )
  with check (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    public.has_permission(organization_id, 'documents.delete')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

-- 6. hearings
drop policy if exists "hearings_insert" on public.hearings;
create policy "hearings_insert" on public.hearings
  for insert with check (
    public.has_permission(organization_id, 'hearings.create')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "hearings_update" on public.hearings;
create policy "hearings_update" on public.hearings
  for update
  using (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  )
  with check (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "hearings_delete" on public.hearings;
create policy "hearings_delete" on public.hearings
  for delete using (
    public.has_permission(organization_id, 'hearings.delete')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

-- 7. time_entries — ANDed alongside the existing invoiced/paid lock.
drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert" on public.time_entries
  for insert with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update" on public.time_entries
  for update
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries
  for delete using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

-- 8. expenses — ANDed alongside the existing invoiced lock (0048).
drop policy if exists "expenses_insert" on public.expenses;
create policy "expenses_insert" on public.expenses
  for insert
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  );

drop policy if exists "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses
  for update
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete" on public.expenses
  for delete
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

-- 9. matter_assignments — reassignment is blocked too (matter_id is never
--    null here, unlike the tables above).
drop policy if exists "matter_assignments_insert" on public.matter_assignments;
create policy "matter_assignments_insert" on public.matter_assignments
  for insert with check (
    (public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign'))
    and public.matter_is_open(matter_id)
  );

drop policy if exists "matter_assignments_delete" on public.matter_assignments;
create policy "matter_assignments_delete" on public.matter_assignments
  for delete using (
    (public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign'))
    and public.matter_is_open(matter_id)
  );

-- 10. Storage — defense in depth so the restriction can't be bypassed by
--     talking to storage.objects directly. Both buckets store objects at
--     <org_id>/<matter_id-or-'general'>/<uuid>-<filename>.
drop policy if exists "documents_storage_insert" on storage.objects;
create policy "documents_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.upload')
    and ((storage.foldername(name))[2] = 'general' or public.matter_is_open(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists "documents_storage_delete" on storage.objects;
create policy "documents_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.delete')
    and ((storage.foldername(name))[2] = 'general' or public.matter_is_open(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists "receipts_storage_insert" on storage.objects;
create policy "receipts_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'billing.view')
    and ((storage.foldername(name))[2] = 'general' or public.matter_is_open(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists "receipts_storage_delete" on storage.objects;
create policy "receipts_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.storage_path = name
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and (not e.invoiced or public.is_partner_or_above(e.organization_id))
        and (e.matter_id is null or public.matter_is_open(e.matter_id))
    )
  );

-- 11. matters.reopen permission — seeded to managing_partner only, same
--     shape as payments.void (0049).
insert into public.permissions (key, resource, action, description)
values ('matters.reopen', 'matters', 'reopen', 'Reopen a closed matter, restoring normal permissions')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'matters.reopen'
  and r.key = 'managing_partner'
on conflict do nothing;

-- 12. reopen_matter() — the single deliberate bypass of the freeze above.
create or replace function public.reopen_matter(p_matter uuid, p_reason text default null)
returns public.matters
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.matters;
  v_org uuid;
  v_prev_status public.matter_status;
begin
  select organization_id, status into v_org, v_prev_status from public.matters where id = p_matter for update;
  if v_org is null then
    raise exception 'Matter not found';
  end if;
  if not public.has_permission(v_org, 'matters.reopen') then
    raise exception 'Only a Managing Partner can reopen a matter';
  end if;
  if v_prev_status not in ('closed', 'won', 'lost') then
    raise exception 'Matter is not closed';
  end if;

  perform set_config('app.status_change_reason', coalesce(p_reason, ''), true);

  update public.matters
  set status = 'open', closed_on = null, updated_at = now()
  where id = p_matter
  returning * into rec;

  perform public.log_audit(
    p_org => v_org,
    p_action => 'matter.reopened',
    p_entity_type => 'matter',
    p_entity_id => p_matter,
    p_summary => 'Reopened matter ' || coalesce(rec.matter_number, '') || ' — ' || rec.title,
    p_metadata => jsonb_build_object('previous_status', v_prev_status, 'reason', p_reason)
  );

  return rec;
end;
$$;

-- 13. track_matter_status() — distinguish closing/reopening in the Activity
--     Timeline and pick up an optional reason via the transaction-local GUC
--     reopen_matter() sets. The existing close path (matters.service.ts's
--     update()) never sets that GUC, so it's unaffected beyond the new kind.
create or replace function public.track_matter_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.status_change_reason', true), '');
  v_kind text;
  v_summary text;
begin
  if new.status is distinct from old.status then
    v_kind := case
      when new.status in ('closed', 'won', 'lost') then 'matter_closed'
      when old.status in ('closed', 'won', 'lost') then 'matter_reopened'
      else 'status_changed'
    end;
    v_summary := 'Status changed from ' || old.status || ' to ' || new.status;
    if v_reason is not null then
      v_summary := v_summary || ' — ' || v_reason;
    end if;
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (
      new.organization_id, new.id, auth.uid(), v_kind, v_summary,
      jsonb_build_object('from', old.status, 'to', new.status, 'reason', v_reason)
    );
  end if;
  return new;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0051_self_service_registration.sql
-- ============================================================
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

-- ============================================================
-- ==> supabase/migrations/0052_demo_orgs_and_registration_settings.sql
-- ============================================================
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

-- ============================================================
-- ==> supabase/migrations/0053_commercial_plan_catalog.sql
-- ============================================================
-- Commercial Model Overhaul, Part A — plan catalog + subscriptions schema.
--
-- Reprices the dormant 3-tier catalog (starter/professional/enterprise from
-- 0006) to the official 4-tier structure, adds the "business" tier, retires
-- the single-plan "early_access" trial model from 0051, and extends
-- subscriptions with the columns a real Paystack integration and a real
-- lifecycle (expired/suspended, scheduled downgrades, trial reminders)
-- need. Existing organizations are never touched destructively — every
-- plan row keeps its existing id, so any subscriptions.plan_id FK stays
-- valid across this migration.

-- 1. Reprice/extend the existing plans, add "business", retire "early_access".
update public.plans set
  price_monthly = 15000, price_yearly = 150000, max_users = 3, trial_duration_days = 30,
  description = 'For solo lawyers and small law firms',
  highlights = array[
    'Up to 3 users', 'Core matter management', 'Client management', 'Contacts', 'Documents',
    'Hearings & Calendar', 'Tasks', 'Email notifications', 'Time tracking', 'Expenses',
    'Basic billing & invoicing', 'Basic reports'
  ],
  sort_order = 10
where key = 'starter';

update public.plans set
  price_monthly = 50000, price_yearly = 500000, max_users = 10, trial_duration_days = 30,
  description = 'For growing and established law firms',
  highlights = array[
    'Up to 10 users', 'Everything in Starter', 'Advanced task management', 'Advanced notifications',
    'Email + WhatsApp reminders', 'Advanced billing', 'Advanced reports',
    'Increased document storage', 'Priority support'
  ],
  sort_order = 20
where key = 'professional';

insert into public.plans (key, name, description, price_monthly, price_yearly, max_users, storage_gb, trial_duration_days, highlights, sort_order)
values (
  'business', 'Business', 'For larger law firms', 100000, 1000000, 25, 250, 30,
  array[
    'Up to 25 users', 'Everything in Professional', 'Advanced analytics', 'Workflow automation',
    'More storage', 'Advanced firm controls', 'Priority support'
  ],
  25
)
on conflict (key) do update set
  price_monthly = excluded.price_monthly, max_users = excluded.max_users, highlights = excluded.highlights;

-- Enterprise is deliberately "starting from" — is_custom=true is what the UI
-- keys off to render "Custom pricing" instead of a fixed amount and to route
-- to "Contact sales" instead of Paystack checkout. price_monthly stays as
-- the honest floor, never presented as a hard price.
update public.plans set
  name = 'Enterprise', price_monthly = 150000, price_yearly = 1500000, max_users = null,
  is_custom = true, trial_duration_days = 30,
  description = 'Custom pricing for larger or custom firms',
  highlights = array[
    'Custom number of users', 'Custom storage', 'Custom features & workflows',
    'Custom integrations', 'Custom support requirements'
  ],
  sort_order = 30
where key = 'enterprise';

-- The old single-plan self-service trial model is retired, not deleted —
-- any existing org's subscription.plan_id referencing it stays valid.
update public.plans set is_active = false where key = 'early_access';

-- 2. paystack_plan_code — Platform Admin populates this once real Paystack
--    Plan objects exist on their dashboard; null means "not configured yet".
alter table public.plans add column paystack_plan_code text;

-- 3. subscriptions — Paystack + lifecycle columns.
alter table public.subscriptions
  add column paystack_customer_code text,
  add column paystack_subscription_code text,
  add column paystack_transaction_reference text,
  add column amount numeric(12, 2),
  add column currency text not null default 'NGN',
  add column cancellation_reason text,
  add column next_billing_date timestamptz,
  add column scheduled_plan_id uuid references public.plans(id),
  add column scheduled_change_at timestamptz,
  add column last_trial_reminder_days integer;

-- 4. New lifecycle statuses — additive only, existing values untouched.
--    Not referenced anywhere else in this migration (Postgres forbids using
--    a just-added enum value within the same transaction it was added in).
alter type public.subscription_status add value if not exists 'expired';
alter type public.subscription_status add value if not exists 'suspended';

-- 5. registration_settings — 30-day default (was 90), still Platform-
--    Console-configurable. trial_plan_id/trial_future_price are no longer
--    read (self-service registration becomes plan-choice-driven in the next
--    migration) — left in place rather than dropped, harmless.
update public.registration_settings set trial_duration_days = 30 where id = true;

-- 6. create_organization() — the Platform Admin manual-creation RPC (kept
--    fully intact otherwise) had two stale defaults: it always fell back to
--    'professional' when no plan was chosen, and always granted a flat
--    14-day trial regardless of which plan that resolved to. Both now
--    follow the new catalog: 'starter' is the entry-tier default, and trial
--    length comes from the resolved plan's own trial_duration_days.
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
      period_end := case when p_billing_cycle = 'yearly' then now() + interval '1 year' else now() + interval '1 month' end;
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
$$;

-- ============================================================
-- ==> supabase/migrations/0054_plan_aware_registration_and_seat_limits.sql
-- ============================================================
-- Commercial Model Overhaul, Part B — self-service registration becomes
-- plan-aware, and seat limits are enforced for the first time anywhere in
-- this app (previously subscriptions.seats was purely informational).

-- 1. register_organization() gains a required p_plan_id — the registering
--    user's own choice among the 4 active plans, rather than always
--    resolving the single registration_settings.trial_plan_id. Always
--    creates a 'trialing' subscription at the plan's own trial_duration_days
--    (30) regardless of whether the frontend immediately follows up with a
--    Paystack checkout ("Subscribe Now") or not ("Start Free Trial") — see
--    Part C/D. This keeps org-creation atomic and payment-failure-safe: an
--    abandoned checkout never leaves a half-created organization, it just
--    sits on its normal trial.
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

  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_slug), ''), p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'firm'; end if;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
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

-- Old 9-arg signature (no p_plan_id) is gone — drop it explicitly so the
-- overload doesn't linger and shadow the new one for stale PostgREST caches.
drop function if exists public.register_organization(text, text, text, text, text, text, text, text, text[]);

grant execute on function public.register_organization(text, text, uuid, text, text, text, text, text, text, text[]) to authenticated;

-- 2. Seat-limit enforcement — the spec's own worked example (§11).
create or replace function public.can_add_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select seats from public.subscriptions where organization_id = p_org), 999999)
       > (select count(*) from public.memberships where organization_id = p_org and status = 'active');
$$;

drop policy if exists "memberships_write_admin" on public.memberships;

create policy "memberships_insert" on public.memberships
  for insert with check (
    public.is_org_admin(organization_id)
    and public.can_add_member(organization_id)
  );

create policy "memberships_update" on public.memberships
  for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy "memberships_delete" on public.memberships
  for delete using (public.is_org_admin(organization_id));

-- 3. accept_invitation() gets the identical guard — the second (and only
--    other) path that can create a membership row.
create or replace function public.accept_invitation(p_token uuid)
returns public.memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations;
  me_email citext;
  mem public.memberships;
begin
  select email into me_email from public.profiles where id = auth.uid();
  if me_email is null then
    raise exception 'No authenticated profile' using errcode = '42501';
  end if;

  select * into inv from public.invitations where token = p_token;
  if inv.id is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv.status <> 'pending' then
    raise exception 'Invitation is no longer valid' using errcode = 'P0001';
  end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'Invitation has expired' using errcode = 'P0001';
  end if;
  if lower(inv.email) <> lower(me_email) then
    raise exception 'Invitation was issued to a different email' using errcode = '42501';
  end if;
  if not public.can_add_member(inv.organization_id) then
    raise exception 'Seat limit reached for this organization''s plan' using errcode = 'P0001';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (inv.organization_id, auth.uid(), inv.role_id, 'active', inv.invited_by, inv.created_at, now())
  on conflict (organization_id, user_id)
    do update set status = 'active', role_id = excluded.role_id
  returning * into mem;

  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  update public.profiles
    set default_organization_id = coalesce(default_organization_id, inv.organization_id)
    where id = auth.uid();

  perform public.log_audit(inv.organization_id, 'invitation.accepted', 'membership', mem.id,
    'User accepted invitation', jsonb_build_object('email', me_email));

  return mem;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0055_trial_lifecycle_cron.sql
-- ============================================================
-- Commercial Model Overhaul, Part E — trial lifecycle automation.
--
-- Per an explicit decision this round: date-triggered transitions (trial
-- reminders, trial -> expired, scheduled downgrades taking effect, past_due
-- -> suspended) run on a real daily pg_cron job, not a lazy on-load check,
-- so they fire exactly on schedule regardless of whether anyone logs in.

create extension if not exists pg_cron;

-- notify_org_members() — same fan-out shape as notify_matter_team() (0047),
-- looping every active membership instead of a matter's team. No actor
-- (these are system-generated).
create or replace function public.notify_org_members(
  p_org uuid,
  p_category public.notification_category,
  p_action text,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  for recipient in
    select user_id from public.memberships where organization_id = p_org and status = 'active'
  loop
    perform public.notify_user(p_org, recipient, null, p_category, p_action, 'subscription', p_org, p_title, p_priority);
  end loop;
end;
$$;

-- run_daily_subscription_checks() — the single scheduled job covering every
-- date-triggered subscription transition:
--   1. Trial reminders at 30/14/7/3/1 days remaining (dedup via
--      last_trial_reminder_days, so re-running the job the same day, or
--      catching up after downtime, never double-notifies).
--   2. Trial -> expired once trial_ends_at has passed.
--   3. Scheduled downgrades (Part F) taking effect on their billing date.
--   4. past_due -> suspended after a 7-day grace window.
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
    select s.id, s.organization_id, p.name as plan_name, s.last_trial_reminder_days,
           ceil(extract(epoch from (s.trial_ends_at - now())) / 86400)::int as days_left
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

  -- Scheduled downgrades taking effect on their billing date.
  update public.subscriptions
  set plan_id = scheduled_plan_id, scheduled_plan_id = null, scheduled_change_at = null
  where scheduled_change_at is not null and scheduled_change_at <= now();

  -- past_due -> suspended after a 7-day grace window.
  update public.subscriptions
  set status = 'suspended'
  where status = 'past_due' and updated_at < now() - interval '7 days';
end;
$$;

select cron.schedule('daily-subscription-checks', '0 6 * * *', $$select public.run_daily_subscription_checks();$$);

-- ============================================================
-- ==> supabase/migrations/0056_plan_change_and_cancel.sql
-- ============================================================
-- Commercial Model Overhaul, Part F — upgrade/downgrade/cancel RPCs behind
-- the new Plan & Billing management UI. All three are organization.manage-
-- gated (the same permission already correctly excluding Senior Associates,
-- per research — no new permission key needed).

-- Downgrades are scheduled for the next billing date, never applied
-- immediately — no feature/data loss for what's already been paid for.
-- The pg_cron job (0055) applies it once scheduled_change_at arrives.
create or replace function public.schedule_plan_downgrade(p_org uuid, p_plan_id uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set scheduled_plan_id = p_plan_id,
      scheduled_change_at = coalesce(current_period_end, trial_ends_at, now())
  where organization_id = p_org
  returning * into rec;

  if rec.id is null then
    raise exception 'No subscription found for this organization';
  end if;

  perform public.log_audit(p_org, 'subscription.downgrade_scheduled', 'subscription', rec.id,
    'Plan downgrade scheduled', jsonb_build_object('plan_id', p_plan_id, 'effective_at', rec.scheduled_change_at));
  return rec;
end;
$$;

create or replace function public.cancel_scheduled_downgrade(p_org uuid)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set scheduled_plan_id = null, scheduled_change_at = null
  where organization_id = p_org
  returning * into rec;

  return rec;
end;
$$;

create or replace function public.cancel_subscription(p_org uuid, p_reason text default null)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where organization_id = p_org
  returning * into rec;

  if rec.id is null then
    raise exception 'No subscription found for this organization';
  end if;

  perform public.log_audit(p_org, 'subscription.cancelled', 'subscription', rec.id,
    'Subscription cancelled', jsonb_build_object('reason', p_reason));
  return rec;
end;
$$;

grant execute on function public.schedule_plan_downgrade(uuid, uuid) to authenticated;
grant execute on function public.cancel_scheduled_downgrade(uuid) to authenticated;
grant execute on function public.cancel_subscription(uuid, text) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0057_task_reminder_engine_schema.sql
-- ============================================================
-- ============================================================================
-- Migration 0057 — Task & Meeting Notification/Reminder Engine, Part A: schema.
--
-- Additive-only. Adds what the reminder engine (0058/0059) and its UI (Part
-- E/F) need: a 'cancelled' task status, dedup/audit columns on tasks so the
-- scheduler never double-sends, WhatsApp + per-event-type columns on
-- notification_preferences, and a new notification_log table — the per-
-- channel delivery audit trail §11 of the spec asks for. pg_net is the
-- documented Supabase mechanism for a pg_cron job to call an Edge Function
-- (net.http_post), used starting in migration 0059.
-- ============================================================================

alter type public.task_status add value if not exists 'cancelled';

alter table public.tasks
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists is_overdue boolean not null default false,
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz,
  add column if not exists overdue_last_notified_at timestamptz;

-- notification_preferences: WhatsApp delivery + per-event-type channel
-- prefs. Kept as one JSONB column (task_channel_prefs) rather than ~10
-- booleans — same 5 event-type x {email, whatsapp} shape, extensible later
-- without another migration. In-app is intentionally NOT in this JSONB —
-- task-assignment in-app notifications stay the one always-on "critical"
-- channel (never user-disableable), matching notify_task_assigned's
-- existing unconditional behavior (0044).
alter table public.notification_preferences
  add column if not exists whatsapp_enabled boolean not null default false,
  add column if not exists whatsapp_number text,
  add column if not exists task_channel_prefs jsonb not null default '{
    "assigned":   {"email": true, "whatsapp": true},
    "due_soon":   {"email": true, "whatsapp": true},
    "overdue":    {"email": true, "whatsapp": true},
    "completed":  {"email": true, "whatsapp": true},
    "reassigned": {"email": true, "whatsapp": true}
  }'::jsonb;

-- ----------------------------------------------------------------------------
-- notification_log — auditable per-channel delivery record (spec §11).
-- Written exclusively by SECURITY DEFINER functions (notify_task_event,
-- dispatch_task_reminder) and the service-role send-task-notification Edge
-- Function — never directly by a client, same posture as `notifications`.
-- ----------------------------------------------------------------------------
create table public.notification_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  actor_id          uuid references public.profiles(id) on delete set null, -- who caused it; null for system/scheduler-generated events
  task_id           uuid references public.tasks(id) on delete cascade,
  notification_type text not null, -- 'task_assigned' | 'task_due_24h' | 'task_due_1h' | 'task_overdue' | 'task_completed' | 'task_reassigned'
  channel           text not null check (channel in ('IN_APP','EMAIL','WHATSAPP')),
  status            text not null default 'PENDING' check (status in ('PENDING','SENT','DELIVERED','FAILED')),
  created_at        timestamptz not null default now(),
  sent_at           timestamptz,
  failure_reason    text
);

create index idx_notification_log_task on public.notification_log (task_id);
create index idx_notification_log_user on public.notification_log (user_id, created_at desc);
create index idx_notification_log_org on public.notification_log (organization_id, created_at desc);

alter table public.notification_log enable row level security;

-- Tenant isolation: a user sees only their own delivery log, or their org
-- admin sees the firm's — never another organization's rows (spec §16).
create policy "notification_log_select" on public.notification_log
  for select using (user_id = auth.uid() or public.is_org_admin(organization_id));
-- No insert/update policy — every write goes through SECURITY DEFINER
-- functions or the service-role Edge Function, which bypass RLS entirely.

create extension if not exists pg_net;

-- ============================================================
-- ==> supabase/migrations/0058_task_reminder_engine_triggers.sql
-- ============================================================
-- ============================================================================
-- Migration 0058 — Task & Meeting Notification/Reminder Engine, Part B:
-- task lifecycle triggers + timeline entries.
--
-- Builds on 0044's notify_task_assigned()/track_task_assigned() rather than
-- replacing them: they now distinguish a first assignment from a genuine
-- reassignment. A shared notify_task_event() helper is introduced here and
-- reused by every trigger below and by the Part D scheduler (0059) — it
-- writes both the in-app `notifications` row (via notify_user) and a
-- matching `notification_log` IN_APP/SENT row in one call, so in-app events
-- show up in the audit trail too.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- task_notification_priority — maps a task's priority to the notification
-- system's own priority enum, reused everywhere a task-related notification
-- is raised so Urgent/High tasks get the same red/amber visual emphasis in
-- the bell/notifications list that TASK_PRIORITY_META already gives them on
-- every task row (spec §2).
-- ----------------------------------------------------------------------------
create or replace function public.task_notification_priority(p_priority public.task_priority)
returns public.notification_priority
language sql
immutable
as $$
  select case p_priority
    when 'urgent' then 'urgent'::public.notification_priority
    when 'high' then 'warning'::public.notification_priority
    else 'info'::public.notification_priority
  end
$$;

-- ----------------------------------------------------------------------------
-- notify_task_event — the shared fan-out every task trigger (and the Part D
-- scheduler) calls: one in-app notification + one notification_log row.
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_event(
  p_org uuid,
  p_task_id uuid,
  p_matter_id uuid,
  p_user uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_priority public.notification_priority default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user is null then
    return;
  end if;
  perform public.notify_user(
    p_org, p_user, p_actor, 'tasks', p_type,
    case when p_matter_id is not null then 'matter' else 'task' end,
    coalesce(p_matter_id, p_task_id),
    p_title, p_priority
  );
  insert into public.notification_log
    (organization_id, user_id, actor_id, task_id, notification_type, channel, status, sent_at)
  values
    (p_org, p_user, p_actor, p_task_id, p_type, 'IN_APP', 'SENT', now());
end;
$$;

-- ----------------------------------------------------------------------------
-- reset_task_reminders_on_change — whenever the assignee or due date changes,
-- clear every reminder-dedup column so the scheduler recomputes cleanly for
-- the new assignee/deadline (spec §15: reassigned -> old assignee stops
-- receiving anything further since every reminder query reads the *current*
-- assignee_id; due date changed -> recalculate reminders).
-- ----------------------------------------------------------------------------
create or replace function public.reset_task_reminders_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assignee_id is distinct from old.assignee_id or new.due_date is distinct from old.due_date then
    new.reminder_24h_sent_at := null;
    new.reminder_1h_sent_at := null;
    new.overdue_last_notified_at := null;
    new.is_overdue := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_task_reminders_on_change on public.tasks;
create trigger trg_reset_task_reminders_on_change
  before update on public.tasks
  for each row execute function public.reset_task_reminders_on_change();

-- ----------------------------------------------------------------------------
-- set_task_completion_fields — records who completed a task and when,
-- server-side (not trusted from the client), and clears both if a task is
-- reopened from 'done'.
-- ----------------------------------------------------------------------------
create or replace function public.set_task_completion_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := auth.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_task_completion_fields on public.tasks;
create trigger trg_set_task_completion_fields
  before update on public.tasks
  for each row execute function public.set_task_completion_fields();

-- ----------------------------------------------------------------------------
-- notify_task_assigned (0044) extended — distinguishes a first assignment
-- from a genuine reassignment (old assignee not null, new one different),
-- and now routes through notify_task_event so the assignment also lands in
-- notification_log, and carries the task's own priority through to the
-- notification's priority (Urgent/High tasks stand out in the bell too).
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
  reassigned boolean;
begin
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
    reassigned := false;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
    reassigned := assigned and old.assignee_id is not null;
  end if;

  if assigned and (auth.uid() is null or new.assignee_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_task_event(
      new.organization_id, new.id, new.matter_id, new.assignee_id, auth.uid(),
      case when reassigned then 'task_reassigned' else 'task_assigned' end,
      coalesce(actor_name, 'Someone') ||
        (case when reassigned then ' reassigned you a task: ' else ' assigned you a task: ' end) || new.title,
      public.task_notification_priority(new.priority)
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- ----------------------------------------------------------------------------
-- track_task_assigned (0044) extended — same first-assignment vs
-- reassignment distinction, now logged as separate matter_events kinds.
-- ----------------------------------------------------------------------------
create or replace function public.track_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assignee_name text;
  assigned boolean;
  reassigned boolean;
begin
  if new.matter_id is null then return new; end if;
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
    reassigned := false;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
    reassigned := assigned and old.assignee_id is not null;
  end if;
  if not assigned then return new; end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select full_name into assignee_name from public.profiles where id = new.assignee_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(),
    case when reassigned then 'task_reassigned' else 'task_assigned' end,
    coalesce(actor_name, 'Someone') || (case when reassigned then ' reassigned task "' else ' assigned task "' end)
      || new.title || '" to ' || coalesce(assignee_name, 'someone'));
  return new;
end $$;

drop trigger if exists trg_track_task_assigned on public.tasks;
create trigger trg_track_task_assigned
  after insert or update of assignee_id on public.tasks
  for each row execute function public.track_task_assigned();

-- ----------------------------------------------------------------------------
-- notify_task_completed — tells the task's creator when someone else
-- completes it (spec §5). Cancels-future-reminders is already implicit: the
-- Part D scheduler only ever looks at tasks with status not in ('done',
-- 'cancelled').
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if new.status = 'done' and old.status is distinct from 'done'
     and new.created_by is not null and (auth.uid() is null or new.created_by <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.notify_task_event(
      new.organization_id, new.id, new.matter_id, new.created_by, auth.uid(),
      'task_completed', coalesce(actor_name, 'Someone') || ' completed: ' || new.title, 'info'
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_completed on public.tasks;
create trigger trg_notify_task_completed
  after update on public.tasks
  for each row execute function public.notify_task_completed();

-- ----------------------------------------------------------------------------
-- track_task_deleted — cascade-guarded exactly like track_hearing_deleted/
-- track_document_removed: skip when the parent matter/org is what's actually
-- being torn down, only log when the task itself is deliberately removed.
-- ----------------------------------------------------------------------------
create or replace function public.track_task_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.matters where id = old.matter_id)
     or not exists (select 1 from public.organizations where id = old.organization_id) then
    return old;
  end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (old.organization_id, old.matter_id, auth.uid(), 'task_deleted',
    coalesce(actor_name, 'Someone') || ' deleted task "' || old.title || '"');
  return old;
end $$;

drop trigger if exists trg_track_task_deleted on public.tasks;
create trigger trg_track_task_deleted
  after delete on public.tasks
  for each row execute function public.track_task_deleted();

-- ----------------------------------------------------------------------------
-- track_task_priority_changed / track_task_due_date_changed — targeted,
-- only fire on an actual change to that one field (spec §14).
-- ----------------------------------------------------------------------------
create or replace function public.track_task_priority_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null or new.priority = old.priority then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(), 'task_priority_changed',
    coalesce(actor_name, 'Someone') || ' changed priority of "' || new.title || '" to ' || new.priority);
  return new;
end $$;

drop trigger if exists trg_track_task_priority_changed on public.tasks;
create trigger trg_track_task_priority_changed
  after update of priority on public.tasks
  for each row execute function public.track_task_priority_changed();

create or replace function public.track_task_due_date_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null or new.due_date is not distinct from old.due_date then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
  values (new.organization_id, new.matter_id, auth.uid(), 'task_due_date_changed',
    coalesce(actor_name, 'Someone') || ' changed the due date of "' || new.title || '" to ' ||
    coalesce(to_char(new.due_date, 'FMMon DD, YYYY'), 'none'));
  return new;
end $$;

drop trigger if exists trg_track_task_due_date_changed on public.tasks;
create trigger trg_track_task_due_date_changed
  after update of due_date on public.tasks
  for each row execute function public.track_task_due_date_changed();

-- ============================================================
-- ==> supabase/migrations/0059_task_reminder_scheduler.sql
-- ============================================================
-- ============================================================================
-- Migration 0059 — Task & Meeting Notification/Reminder Engine, Part D:
-- the server-side scheduler. Does not depend on the app being open (spec
-- §10) — a pg_cron job runs run_task_reminders() hourly, independently of
-- the existing daily-subscription-checks job (0055); cron.schedule is keyed
-- by job name, so both coexist without interference.
--
-- dispatch_task_notification() is the one shared fan-out used both here
-- (for the three reminder/overdue event types) AND — via the two function
-- upgrades below — by task assignment/reassignment/completion, so every
-- task-related notification (not just reminders) gets real email/WhatsApp
-- delivery, gated by the recipient's notification_preferences.
--
-- REQUIRED ONE-TIME MANUAL STEP (cannot be embedded in a migration file —
-- these are per-project secrets, not schema): run_task_reminders() calls the
-- send-task-notification Edge Function via pg_net, which needs to know this
-- project's own URL and a service-role bearer token. From the Supabase SQL
-- editor, once, run:
--   alter database postgres set app.settings.supabase_url = 'https://<your-project-ref>.supabase.co';
--   alter database postgres set app.settings.service_role_key = '<service-role-key>';
-- Until both are set, dispatch_task_notification() honestly records EMAIL/
-- WHATSAPP attempts as FAILED ("Scheduler is not fully configured…") rather
-- than silently dropping them or faking success — in-app notifications are
-- unaffected either way, since those never leave the database.
-- ============================================================================

create or replace function public.dispatch_task_notification(
  p_task_id uuid,
  p_user_id uuid,
  p_type text,              -- 'task_assigned' | 'task_due_24h' | 'task_due_1h' | 'task_overdue' | 'task_completed' | 'task_reassigned'
  p_priority public.notification_priority,
  p_channel_key text,       -- key into notification_preferences.task_channel_prefs
  p_actor uuid default null,
  p_title text default null,
  p_log_timeline boolean default false,
  p_repeat_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  prefs record;
  base_url text;
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
  fn_title text;
begin
  select id, organization_id, matter_id, title into t from public.tasks where id = p_task_id;
  if t.id is null or p_user_id is null then
    return;
  end if;

  fn_title := coalesce(p_title, t.title);

  -- In-app: always fires, matching the pre-existing always-on behavior for
  -- task notifications (spec §7's "critical notifications" carve-out).
  perform public.notify_task_event(t.organization_id, t.id, t.matter_id, p_user_id, p_actor, p_type, fn_title, p_priority);

  -- Timeline: only for reminder/overdue events, and never on a repeat
  -- overdue notification (spec §14 — don't spam the timeline with every
  -- daily repeat). Lifecycle events (assigned/reassigned/completed) already
  -- get their own dedicated matter_events entry from the 0058 triggers, so
  -- this never double-logs those.
  if p_log_timeline and not p_repeat_only and t.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (t.organization_id, t.matter_id, p_actor,
      case when p_type = 'task_overdue' then 'task_overdue' else 'task_reminder_sent' end,
      fn_title);
  end if;

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'whatsapp')::boolean, true);

  if not send_email and not send_whatsapp then
    return;
  end if;

  base_url := current_setting('app.settings.supabase_url', true);
  svc_key := current_setting('app.settings.service_role_key', true);

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if base_url is null or svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (missing app.settings.supabase_url / service_role_key).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if base_url is null or svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (missing app.settings.supabase_url / service_role_key).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Upgrade the 0058 lifecycle triggers to also dispatch email/WhatsApp (not
-- just in-app) — the acceptance scenario (spec §17) requires assignment to
-- deliver in-app *and* email *and* WhatsApp-if-configured immediately, not
-- only on the next reminder tick. p_log_timeline stays false: matter_events
-- for these events is already written by track_task_assigned/track_task_
-- completed (0058), so dispatch must not duplicate that entry.
-- ----------------------------------------------------------------------------
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  assigned boolean;
  reassigned boolean;
  event_title text;
begin
  if tg_op = 'INSERT' then
    assigned := new.assignee_id is not null;
    reassigned := false;
  else
    assigned := new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id;
    reassigned := assigned and old.assignee_id is not null;
  end if;

  if assigned and (auth.uid() is null or new.assignee_id <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    event_title := coalesce(actor_name, 'Someone') ||
      (case when reassigned then ' reassigned you a task: ' else ' assigned you a task: ' end) || new.title;
    perform public.dispatch_task_notification(
      p_task_id := new.id, p_user_id := new.assignee_id,
      p_type := case when reassigned then 'task_reassigned' else 'task_assigned' end,
      p_priority := public.task_notification_priority(new.priority),
      p_channel_key := case when reassigned then 'reassigned' else 'assigned' end,
      p_actor := auth.uid(), p_title := event_title
    );
  end if;
  return new;
end $$;

create or replace function public.notify_task_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
begin
  if new.status = 'done' and old.status is distinct from 'done'
     and new.created_by is not null and (auth.uid() is null or new.created_by <> auth.uid()) then
    select full_name into actor_name from public.profiles where id = auth.uid();
    perform public.dispatch_task_notification(
      p_task_id := new.id, p_user_id := new.created_by, p_type := 'task_completed',
      p_priority := 'info', p_channel_key := 'completed',
      p_actor := auth.uid(), p_title := coalesce(actor_name, 'Someone') || ' completed: ' || new.title
    );
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- run_task_reminders — the single place that finds incomplete, assigned,
-- due-dated tasks approaching (or past) their deadline, checks whether each
-- reminder type is already sent, sends it, records it, and never double-
-- sends (spec §10, verbatim). Deadline is a documented fixed constant
-- (17:00 UTC on the due date) since due_date has no time component — see
-- the plan's Context section for why.
-- ----------------------------------------------------------------------------
create or replace function public.run_task_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_deadline timestamptz;
begin
  for r in
    select id, assignee_id, reminder_24h_sent_at, reminder_1h_sent_at, is_overdue, overdue_last_notified_at, due_date
    from public.tasks
    where status not in ('done', 'cancelled')
      and assignee_id is not null
      and due_date is not null
  loop
    v_deadline := (r.due_date::timestamptz + time '17:00');

    if r.reminder_24h_sent_at is null and now() >= v_deadline - interval '24 hours' and now() < v_deadline then
      perform public.dispatch_task_notification(
        p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_due_24h',
        p_priority := 'reminder', p_channel_key := 'due_soon', p_log_timeline := true
      );
      update public.tasks set reminder_24h_sent_at = now() where id = r.id;
    end if;

    if r.reminder_1h_sent_at is null and now() >= v_deadline - interval '1 hour' and now() < v_deadline then
      perform public.dispatch_task_notification(
        p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_due_1h',
        p_priority := 'warning', p_channel_key := 'due_soon', p_log_timeline := true
      );
      update public.tasks set reminder_1h_sent_at = now() where id = r.id;
    end if;

    if now() >= v_deadline then
      if not r.is_overdue then
        update public.tasks set is_overdue = true where id = r.id;
        perform public.dispatch_task_notification(
          p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_overdue',
          p_priority := 'urgent', p_channel_key := 'overdue', p_log_timeline := true
        );
        update public.tasks set overdue_last_notified_at = now() where id = r.id;
      elsif r.overdue_last_notified_at is null or r.overdue_last_notified_at < now() - interval '20 hours' then
        -- Max one overdue reminder per day (spec §4); >20h tolerates the
        -- hourly tick's own jitter without drifting later each day.
        perform public.dispatch_task_notification(
          p_task_id := r.id, p_user_id := r.assignee_id, p_type := 'task_overdue',
          p_priority := 'urgent', p_channel_key := 'overdue', p_log_timeline := true, p_repeat_only := true
        );
        update public.tasks set overdue_last_notified_at = now() where id = r.id;
      end if;
    end if;
  end loop;
end;
$$;

select cron.schedule('task-reminders', '0 * * * *', $$select public.run_task_reminders();$$);

-- ============================================================
-- ==> supabase/migrations/0060_messaging_permissions.sql
-- ============================================================
-- ============================================================================
-- Migration 0060 — Communication Hub, Part A: permission catalog.
--
-- Four new permissions for firm-wide channels + direct messages. Granted
-- broadly (view/send/create_channels to every system role) since chat is
-- meant to be available firm-wide, like Slack. Note the leadership
-- cross-join in 0003 only ran once at that migration's original execution —
-- permissions added afterward (0030, 0038, 0039, and now this one) always
-- need their own explicit grant, including for leadership roles.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('messaging.view', 'messaging', 'view', 'View channels and direct messages'),
  ('messaging.send', 'messaging', 'send', 'Send messages in channels and direct messages'),
  ('messaging.create_channels', 'messaging', 'create_channels', 'Create new firm-wide channels'),
  ('messaging.manage_channels', 'messaging', 'manage_channels', 'Rename or archive any channel')
on conflict (key) do nothing;

-- view/send/create_channels: every system role.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('messaging.view', 'messaging.send', 'messaging.create_channels')
  and r.key in (
    'platform_owner', 'platform_admin', 'managing_partner', 'partner',
    'senior_associate', 'associate', 'junior_associate', 'paralegal',
    'finance', 'hr', 'secretary', 'receptionist'
  )
on conflict do nothing;

-- manage_channels (rename/archive *any* channel, not just your own): leadership only.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'messaging.manage_channels'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0061_messaging_schema.sql
-- ============================================================
-- ============================================================================
-- Migration 0061 — Communication Hub, Part B: schema, RLS, triggers,
-- realtime, and a small notification hook for direct messages.
--
-- Firm-wide channels (open to every member with messaging.view — no
-- per-channel ACL/join-table in v1) + 1:1 direct messages. Two separate
-- message tables rather than one polymorphic table, matching this
-- codebase's existing preference for concrete per-domain tables and
-- keeping RLS policies simple. Precedents reused: matter_assignments
-- (0030) for the join-table shape, support_ticket_messages (0019) for the
-- "bump parent on new message" trigger, notifications/matter_events
-- (0025/0022) for the Realtime publication pattern.
-- ============================================================================

create table public.channels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  description     text,
  created_by      uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
create index idx_channels_org on public.channels (organization_id);

create table public.channel_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id      uuid not null references public.channels(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index idx_channel_messages_channel on public.channel_messages (channel_id, created_at desc);

-- One row per (channel, user) once they've viewed it; absence = "everything unread".
create table public.channel_reads (
  channel_id   uuid not null references public.channels(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- Exactly 2 participants, so read-state lives as two columns rather than a
-- generic membership table (no group DMs in v1). user_a/user_b are kept in
-- a normalized order (least/greatest) by get_or_create_dm_conversation()
-- below, which is the only way a row here is ever created.
create table public.direct_conversations (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  user_a              uuid not null references public.profiles(id) on delete cascade,
  user_b              uuid not null references public.profiles(id) on delete cascade,
  user_a_last_read_at timestamptz,
  user_b_last_read_at timestamptz,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  -- Strict ordering (not just <>) so (a,b) and (b,a) can never both exist as
  -- separate rows — get_or_create_dm_conversation() always normalizes via
  -- least()/greatest() before insert, this is the DB-level backstop.
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index idx_direct_conversations_org on public.direct_conversations (organization_id);

create table public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index idx_direct_messages_conversation on public.direct_messages (conversation_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RPCs
-- ----------------------------------------------------------------------------

-- The only way a direct_conversations row is created — normalizes the pair
-- order and validates both users are specifically active members of p_org
-- (not just shares_organization's looser "share *some* org" check, which
-- isn't precise enough once a user can belong to more than one firm — a DM
-- must be scoped to the exact org it's tagged with).
create or replace function public.get_or_create_dm_conversation(p_org uuid, p_other uuid)
returns public.direct_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  rec public.direct_conversations;
begin
  if auth.uid() is null or p_other is null or p_other = auth.uid() then
    raise exception 'Invalid conversation participants';
  end if;
  if not public.is_org_member(p_org) then
    raise exception 'You are not a member of this organization';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_other and m.organization_id = p_org and m.status = 'active'
  ) then
    raise exception 'That person is not a member of this organization';
  end if;

  a := least(auth.uid(), p_other);
  b := greatest(auth.uid(), p_other);

  select * into rec from public.direct_conversations where user_a = a and user_b = b;
  if rec.id is not null then
    return rec;
  end if;

  insert into public.direct_conversations (organization_id, user_a, user_b)
  values (p_org, a, b)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.get_or_create_dm_conversation(uuid, uuid) to authenticated;

create or replace function public.mark_channel_read(p_channel uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.channel_reads (channel_id, user_id, last_read_at)
  values (p_channel, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;
$$;

grant execute on function public.mark_channel_read(uuid) to authenticated;

-- Updates only whichever side matches the caller — never lets a user touch
-- the other participant's read-state (hence no direct UPDATE policy on
-- direct_conversations at all).
create or replace function public.mark_dm_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.direct_conversations
  set user_a_last_read_at = case when user_a = auth.uid() then now() else user_a_last_read_at end,
      user_b_last_read_at = case when user_b = auth.uid() then now() else user_b_last_read_at end
  where id = p_conversation and auth.uid() in (user_a, user_b);
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;

-- Powers the sidebar unread badge: unread channel messages (across every
-- channel) + unread DMs (across every conversation), excluding your own
-- messages, for the given org.
create or replace function public.get_unread_message_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select count(*)
      from public.channel_messages cm
      left join public.channel_reads cr on cr.channel_id = cm.channel_id and cr.user_id = auth.uid()
      where cm.organization_id = p_org
        and cm.deleted_at is null
        and cm.author_id is distinct from auth.uid()
        and cm.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz)
    ), 0)
    +
    coalesce((
      select count(*)
      from public.direct_messages dm
      join public.direct_conversations dc on dc.id = dm.conversation_id
      where dc.organization_id = p_org
        and dm.deleted_at is null
        and dm.author_id is distinct from auth.uid()
        and (
          (dc.user_a = auth.uid() and dm.created_at > coalesce(dc.user_a_last_read_at, '-infinity'::timestamptz))
          or (dc.user_b = auth.uid() and dm.created_at > coalesce(dc.user_b_last_read_at, '-infinity'::timestamptz))
        )
    ), 0);
$$;

grant execute on function public.get_unread_message_count(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Triggers — bump the parent thread's last_message_at, same shape as
-- support_ticket_messages' own "bump parent on new message" trigger (0019).
-- ----------------------------------------------------------------------------
create or replace function public.bump_channel_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end $$;

drop trigger if exists trg_bump_channel_last_message on public.channel_messages;
create trigger trg_bump_channel_last_message
  after insert on public.channel_messages
  for each row execute function public.bump_channel_last_message();

create or replace function public.bump_dm_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.direct_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_bump_dm_last_message on public.direct_messages;
create trigger trg_bump_dm_last_message
  after insert on public.direct_messages
  for each row execute function public.bump_dm_last_message();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.channels enable row level security;
alter table public.channel_messages enable row level security;
alter table public.channel_reads enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;

create policy "channels_select" on public.channels
  for select using (public.has_permission(organization_id, 'messaging.view'));
create policy "channels_insert" on public.channels
  for insert with check (public.has_permission(organization_id, 'messaging.create_channels') and created_by = auth.uid());
create policy "channels_update" on public.channels
  for update using (
    created_by = auth.uid()
    or public.is_org_admin(organization_id)
    or public.has_permission(organization_id, 'messaging.manage_channels')
  );

create policy "channel_messages_select" on public.channel_messages
  for select using (public.has_permission(organization_id, 'messaging.view'));
create policy "channel_messages_insert" on public.channel_messages
  for insert with check (
    public.has_permission(organization_id, 'messaging.send')
    and author_id = auth.uid()
    and exists (select 1 from public.channels c where c.id = channel_id and c.organization_id = organization_id and c.archived_at is null)
  );
-- Soft-delete only (client sets deleted_at) — own messages, or an org admin moderating.
create policy "channel_messages_update" on public.channel_messages
  for update using (author_id = auth.uid() or public.is_org_admin(organization_id));

create policy "channel_reads_all" on public.channel_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "direct_conversations_select" on public.direct_conversations
  for select using (auth.uid() in (user_a, user_b));
-- No insert/update policy — get_or_create_dm_conversation()/mark_dm_read() only.

create policy "direct_messages_select" on public.direct_messages
  for select using (exists (
    select 1 from public.direct_conversations dc
    where dc.id = conversation_id and auth.uid() in (dc.user_a, dc.user_b)
  ));
create policy "direct_messages_insert" on public.direct_messages
  for insert with check (
    author_id = auth.uid()
    and public.has_permission(organization_id, 'messaging.send')
    and exists (
      select 1 from public.direct_conversations dc
      where dc.id = conversation_id and dc.organization_id = organization_id and auth.uid() in (dc.user_a, dc.user_b)
    )
  );
-- Soft-delete only, own messages.
create policy "direct_messages_update" on public.direct_messages
  for update using (author_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_messages'
  ) then
    alter publication supabase_realtime add table public.channel_messages;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Notification integration — DMs only. Channel messages deliberately do NOT
-- notify every member on every post (that's exactly the notification-spam
-- this session's Task Reminder Engine work went out of its way to avoid);
-- the sidebar unread badge is the channel-level signal instead. A DM is
-- personal and low-volume, so it gets a real notification, same as every
-- other single-recipient event in this app.
-- ----------------------------------------------------------------------------
alter type public.notification_category add value if not exists 'messaging';

create or replace function public.notify_dm_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recipient uuid;
  actor_name text;
  org uuid;
begin
  select organization_id, case when user_a = new.author_id then user_b else user_a end
    into org, recipient
    from public.direct_conversations where id = new.conversation_id;

  if recipient is null or recipient = new.author_id then
    return new;
  end if;

  select full_name into actor_name from public.profiles where id = new.author_id;
  perform public.notify_user(
    org, recipient, new.author_id, 'messaging', 'message.received',
    'conversation', new.conversation_id,
    coalesce(actor_name, 'Someone') || ' sent you a message', 'info'
  );
  return new;
end $$;

drop trigger if exists trg_notify_dm_message on public.direct_messages;
create trigger trg_notify_dm_message
  after insert on public.direct_messages
  for each row execute function public.notify_dm_message();

-- ============================================================
-- ==> supabase/migrations/0062_clear_audit_log.sql
-- ============================================================
-- ============================================================================
-- Migration 0062 — Let a platform admin clear the audit log.
--
-- audit_logs has never had a delete path — it's append-only by design
-- (0002's own header comment says so). This adds exactly one: a
-- SECURITY DEFINER RPC gated to platform admins, deliberately with no
-- accompanying RLS delete policy, so a raw `supabase.from('audit_logs')
-- .delete()` can never bypass it (same "RPC is the only writer" posture
-- as notification_log/direct_conversations elsewhere in this schema).
--
-- Clearing isn't silent: after the delete, exactly one fresh row is
-- written recording who cleared it and when — the act of clearing the
-- log is itself the one thing that can never be erased from it.
-- ============================================================================

create or replace function public.clear_audit_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can clear the audit log' using errcode = '42501';
  end if;

  delete from public.audit_logs;

  select full_name into actor_name from public.profiles where id = auth.uid();
  perform public.log_audit(
    null, 'audit_log.cleared', null, null,
    coalesce(actor_name, 'A platform administrator') || ' cleared the audit log',
    '{}'::jsonb, true
  );
end;
$$;

grant execute on function public.clear_audit_log() to authenticated;

-- ============================================================
-- ==> supabase/migrations/0063_fix_clear_audit_log_where_clause.sql
-- ============================================================
-- ============================================================================
-- Migration 0063 — Fix clear_audit_log(): "DELETE requires a WHERE clause".
--
-- This project's Supabase database has a safe-update guard enabled that
-- rejects any UPDATE/DELETE with no WHERE clause outright — including one
-- issued from inside a SECURITY DEFINER function, not just raw REST calls.
-- The bare `delete from public.audit_logs;` in 0062 tripped it. Fixed with
-- a tautological `where true`, which satisfies the guard while still
-- deleting every row exactly as intended.
-- ============================================================================

create or replace function public.clear_audit_log()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform administrator can clear the audit log' using errcode = '42501';
  end if;

  delete from public.audit_logs where true;

  select full_name into actor_name from public.profiles where id = auth.uid();
  perform public.log_audit(
    null, 'audit_log.cleared', null, null,
    coalesce(actor_name, 'A platform administrator') || ' cleared the audit log',
    '{}'::jsonb, true
  );
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0063_matter_status_appeal.sql
-- ============================================================
-- ============================================================================
-- Migration 0063 — Add 'appeal' to matter_status.
--
-- Additive only. The "Open a new matter" status list was simplified
-- client-side (Open -> "New"; Pending merged into "In Court"; Won/Lost
-- retired from fresh selection in favor of "Closed") — none of that needs
-- a schema change, since those are just which labels/values the UI offers,
-- and 'pending'/'won'/'lost' remain valid stored values for existing
-- matters (see MATTER_STATUS_META). 'appeal' is the one genuinely new
-- status value, so it's the one addition the enum itself needs.
-- ============================================================================

alter type public.matter_status add value if not exists 'appeal';

-- ============================================================
-- ==> supabase/migrations/0064_channel_archive_delete.sql
-- ============================================================
-- ============================================================================
-- Migration 0064 — Communication Hub: archive and hard-delete a channel.
--
-- Archive (reversible): already possible under the existing
-- channels_update RLS policy (creator, org admin, or messaging.
-- manage_channels holders) — nothing new needed, the frontend just never
-- exposed it. This migration only adds the destructive path.
--
-- Delete (irreversible, "everything in it"): deliberately NOT a raw RLS
-- delete policy — routed only through this RPC, same "RPC is the only
-- writer" discipline as clear_audit_log() (0062), so the deletion can
-- never happen without also being recorded in audit_logs first. Cascades
-- to channel_messages/channel_reads via their existing FKs.
-- ============================================================================

create or replace function public.delete_channel(p_channel uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  msg_count int;
  actor_name text;
begin
  select id, organization_id, name, created_by into ch from public.channels where id = p_channel;
  if ch.id is null then
    raise exception 'Channel not found';
  end if;

  if not (
    ch.created_by = auth.uid()
    or public.is_org_admin(ch.organization_id)
    or public.has_permission(ch.organization_id, 'messaging.manage_channels')
  ) then
    raise exception 'You do not have permission to delete this channel' using errcode = '42501';
  end if;

  select count(*) into msg_count from public.channel_messages where channel_id = p_channel;
  select full_name into actor_name from public.profiles where id = auth.uid();

  delete from public.channels where id = p_channel;

  perform public.log_audit(
    ch.organization_id, 'channel.deleted', 'channel', p_channel,
    format('%s deleted channel "#%s" and %s message%s',
      coalesce(actor_name, 'Someone'), ch.name, msg_count, case when msg_count = 1 then '' else 's' end),
    '{}'::jsonb, false
  );
end;
$$;

grant execute on function public.delete_channel(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0065_workspace_slug_architecture.sql
-- ============================================================
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

-- ============================================================
-- ==> supabase/migrations/0066_reseed_role_permissions.sql
-- ============================================================
-- ============================================================================
-- Migration 0066 — Re-seed role_permissions.
--
-- Consolidates every role_permissions grant statement that has ever been
-- written across this project's history (0003, 0030, 0038, 0039, 0040,
-- 0041, 0049, 0050, 0060) into one place. Every insert uses
-- `on conflict do nothing`, so this is fully idempotent — safe to run on a
-- database that already has some or all of these grants (only fills in
-- whatever's missing), and it's what makes a fresh Supabase project (run
-- 0001 through here in order) end up with a correct, fully-populated
-- role_permissions table without depending on every prior migration having
-- been pasted in flawlessly.
--
-- Why this exists: has_permission() short-circuits true for platform
-- admins regardless of role_permissions content, so a gap here is
-- invisible to a platform-admin tester everywhere except the Roles &
-- Permissions viewer (administration.service.ts's listRolesWithPermissions,
-- which reads role_permissions directly) — that's how this was caught.
-- ============================================================================

-- Platform + firm leadership: every permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- Fee earners (senior/associate/junior).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','calendar.view',
  'staff.view','reports.view','billing.view',
  'clients.view','clients.create','clients.update',
  'matters.view','matters.create','matters.update','matters.assign',
  'documents.view','documents.upload','documents.update',
  'hearings.view','hearings.create','hearings.update',
  'tasks.view','tasks.create','tasks.update','tasks.assign'
)
where r.key in ('senior_associate','associate','junior_associate')
on conflict do nothing;

-- Paralegal.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','calendar.view','staff.view',
  'clients.view','matters.view','matters.update',
  'documents.view','documents.upload','documents.update',
  'hearings.view','hearings.create','hearings.update',
  'tasks.view','tasks.create','tasks.update'
)
where r.key = 'paralegal'
on conflict do nothing;

-- Finance.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','clients.view','matters.view',
  'billing.view','invoices.manage','payments.manage','expenses.manage','trust.manage',
  'reports.view','reports.financial'
)
where r.key = 'finance'
on conflict do nothing;

-- HR.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','members.view','staff.view','staff.manage',
  'departments.view','reports.view'
)
where r.key = 'hr'
on conflict do nothing;

-- Secretary / receptionist.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view','notifications.view','calendar.view',
  'clients.view','matters.view','documents.view',
  'hearings.view','tasks.view','tasks.create','tasks.update'
)
where r.key in ('secretary','receptionist')
on conflict do nothing;

-- matters.view_all (0030)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'matters.view_all'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner', 'finance')
on conflict do nothing;

-- clients.create_duplicate (0038)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.create_duplicate'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- clients.manage_contacts (0039)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.manage_contacts'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- senior_associate: clients.create (0040)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.create'
  and r.key = 'senior_associate'
on conflict do nothing;

-- senior_associate: clients.update, clients.manage_contacts (0041)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('clients.update', 'clients.manage_contacts')
  and r.key = 'senior_associate'
on conflict do nothing;

-- payments.void (0049)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'payments.void'
  and r.key = 'managing_partner'
on conflict do nothing;

-- matters.reopen (0050)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'matters.reopen'
  and r.key = 'managing_partner'
on conflict do nothing;

-- messaging.view/send/create_channels — every role (0060)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('messaging.view', 'messaging.send', 'messaging.create_channels')
  and r.key in (
    'platform_owner', 'platform_admin', 'managing_partner', 'partner',
    'senior_associate', 'associate', 'junior_associate', 'paralegal',
    'finance', 'hr', 'secretary', 'receptionist'
  )
on conflict do nothing;

-- messaging.manage_channels — leadership only (0060)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'messaging.manage_channels'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0067_sync_seats_on_plan_change.sql
-- ============================================================
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

-- 1. One-time backfill. subscriptions.seats is NOT NULL (see migration
--    0006), so a custom/Enterprise plan's max_users = null must coalesce
--    to something — 5 matches the exact fallback register_organization()
--    already uses (migration 0065), not a new convention.
update public.subscriptions s
set seats = coalesce(p.max_users, 5)
from public.plans p
where s.plan_id = p.id
  and s.seats is distinct from coalesce(p.max_users, 5);

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
      seats = coalesce(p.max_users, 5),
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

-- ============================================================
-- ==> supabase/migrations/0068_last_payment_and_billing_date_fix.sql
-- ============================================================
-- ============================================================================
-- Migration 0068 — Track last payment date; fix next_billing_date staying
-- null on every real payment.
--
-- Paystack only sends next_payment_date on transactions tied to a
-- Paystack-managed recurring Subscription (requires plans.paystack_plan_code,
-- which has never actually been populated — see migration 0053's own
-- comment). Every checkout so far has been a one-time transaction, so this
-- field has always been absent, and paystack-webhook was writing that
-- absence straight into both next_billing_date AND current_period_end on
-- every successful charge — visible as "Next billing date: —" in Plan &
-- Billing even for an Active, paid subscription.
--
-- Fixed in paystack-webhook (Edge Function, redeploy required — see below):
-- it now computes next_billing_date itself from the org's own
-- billing_cycle (now + 1 month/year) whenever Paystack doesn't supply one,
-- and stamps last_payment_at so "last billing date" can be shown too.
-- ============================================================================

alter table public.subscriptions
  add column if not exists last_payment_at timestamptz;

-- One-time correction for subscriptions that are already 'active' (a real
-- payment already succeeded) but got left with next_billing_date/
-- current_period_end null by the bug above. Approximates last_payment_at
-- as updated_at (the closest available signal — this row was last touched
-- by that same activation) and derives next_billing_date from billing_cycle
-- the same way the fixed webhook now does going forward.
update public.subscriptions
set last_payment_at = coalesce(last_payment_at, updated_at),
    next_billing_date = coalesce(
      next_billing_date,
      case when billing_cycle = 'yearly'
        then coalesce(updated_at, now()) + interval '1 year'
        else coalesce(updated_at, now()) + interval '1 month'
      end
    ),
    current_period_end = coalesce(
      current_period_end,
      case when billing_cycle = 'yearly'
        then coalesce(updated_at, now()) + interval '1 year'
        else coalesce(updated_at, now()) + interval '1 month'
      end
    )
where status = 'active';

-- ============================================================
-- ==> supabase/migrations/0069_email_registered_check.sql
-- ============================================================
-- ============================================================================
-- Migration 0069 — Pre-flight "is this email already registered" check.
--
-- Supabase's own signUp() deliberately does not reveal whether an email is
-- already registered when that account is already confirmed (a standard
-- anti-account-enumeration protection) — it can silently behave as if
-- signup succeeded, leaving someone typing their own already-registered
-- email stuck waiting for a verification email that was never actually
-- (re-)sent. This narrow, minimal RPC lets the registration form check
-- first and say so immediately, instead of waiting on a signUp() round
-- trip that may never clearly report the real reason.
--
-- Deliberately returns ONLY a boolean — nothing else about the account
-- (name, id, org) is exposed. This is a conscious, small trade-off of
-- "email exists" being checkable pre-signup in exchange for materially
-- better UX on the registration form.
-- ============================================================================

create or replace function public.email_is_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where email = lower(trim(p_email)));
$$;

grant execute on function public.email_is_registered(text) to anon, authenticated;

-- ============================================================
-- ==> supabase/migrations/0070_ai_matter_summary.sql
-- ============================================================
-- ============================================================================
-- Migration 0070 — AI matter summarization, gated to Business/Enterprise.
--
-- Reuses plans.features (already existed, dormant) rather than adding a new
-- column — it's exactly the extensible "what does this plan unlock" bag the
-- schema already provides. { "ai_summarization": true } on Business and
-- Enterprise only. The actual enforcement lives server-side in the
-- summarize-matter Edge Function (checks this same flag via the service-role
-- client) — the frontend flag here only controls what's *shown*; a client-
-- only gate would be trivially bypassable, same principle as every other
-- access check in this app.
-- ============================================================================

update public.plans
set features = features || '{"ai_summarization": true}'::jsonb
where key in ('business', 'enterprise');

-- Persisted so a summary doesn't need regenerating (and re-billing an API
-- call) every time the matter is opened — shown with a "Regenerate" action.
alter table public.matters
  add column if not exists ai_summary text,
  add column if not exists ai_summary_generated_at timestamptz;

-- ============================================================
-- ==> supabase/migrations/0071_sync_organization_status.sql
-- ============================================================
-- ============================================================================
-- Migration 0071 — Keep organizations.status in sync with subscriptions.status.
--
-- Root cause of "org shows Business plan but status still says Trial even
-- after paying": organizations.status is only ever set once, at creation
-- (always 'trial') — nothing ever updated it afterward. paystack-webhook
-- correctly flips subscriptions.status to 'active' on payment (that's why
-- the Plan badge was right), but organizations.status itself was never
-- touched, so it stayed frozen at 'trial' forever regardless of real
-- payment state. cancel_subscription() had the identical gap for
-- cancellations.
--
-- Fix has two parts:
--   1. One-time backfill below — corrects every organization that's
--      already in this stale state right now (including Law Castle Firm).
--   2. cancel_subscription() now also syncs organizations.status.
--   The paystack-webhook Edge Function needs a matching code change
--   (separate deploy — see its own file) to keep doing this going forward
--   for the 'active' transition, since that's a Deno function, not SQL.
-- ============================================================================

-- One-time backfill: any org whose subscription is genuinely active but
-- whose own status column never caught up.
update public.organizations o
set status = 'active'
where o.status = 'trial'
  and exists (
    select 1 from public.subscriptions s
    where s.organization_id = o.id and s.status = 'active'
  );

-- ----------------------------------------------------------------------------
-- organizations.storage_used_bytes has existed since 0006 but nothing has
-- ever written to it — every upload/delete path only ever touched
-- documents.size_bytes, never this column, so it's permanently 0 regardless
-- of real usage ("Storage" showing 0 GB in the Platform Console no matter
-- how many documents exist). Rather than adding yet another manually-
-- maintained counter that can silently drift (the exact bug class fixed
-- twice already today — seats, next_billing_date), this computes it live
-- from the one real source of truth: documents.size_bytes itself.
-- Platform-admin-only, matching every other platform-wide aggregate.
-- ----------------------------------------------------------------------------
create or replace function public.platform_storage_usage()
returns table (organization_id uuid, total_bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select d.organization_id, coalesce(sum(d.size_bytes), 0)::bigint
  from public.documents d
  where public.is_platform_admin()
  group by d.organization_id;
$$;

grant execute on function public.platform_storage_usage() to authenticated;

create or replace function public.cancel_subscription(p_org uuid, p_reason text default null)
returns public.subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.subscriptions;
begin
  if not public.has_permission(p_org, 'organization.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where organization_id = p_org
  returning * into rec;

  if rec.id is null then
    raise exception 'No subscription found for this organization';
  end if;

  update public.organizations set status = 'cancelled' where id = p_org;

  perform public.log_audit(p_org, 'subscription.cancelled', 'subscription', rec.id,
    'Subscription cancelled', jsonb_build_object('reason', p_reason));
  return rec;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0072_litigation_clerk_role.sql
-- ============================================================
-- ============================================================================
-- Migration 0072 — Add 'litigation_clerk' to the role_key enum.
--
-- Split into its own migration, run and committed on its own, because
-- Postgres refuses to let a brand-new enum value be used in the same
-- transaction that added it ("unsafe use of new value... must be committed
-- before they can be used") — even within one pasted script, Supabase's SQL
-- editor runs everything as a single transaction. The role row and its
-- permission grants are in 0073, which must be run as a SEPARATE paste/run
-- after this one, not together with it.
-- ============================================================================

alter type public.role_key add value if not exists 'litigation_clerk';

-- ============================================================
-- ==> supabase/migrations/0073_litigation_clerk_role_grants.sql
-- ============================================================
-- ============================================================================
-- Migration 0073 — Litigation Clerk: role row + permission grants.
--
-- Must be run AFTER 0072 has been run and committed on its own (Postgres
-- won't allow a freshly-added enum value to be used in the same
-- transaction that added it). Covers court-facing logistics staff (filing
-- at registries, serving process, picking up/dropping off paperwork) —
-- narrower than a Paralegal (no client-record access), but can see hearing
-- schedules, log their own billable time/expenses, and update tasks
-- assigned to them. No new permission keys — every one granted here
-- already exists, same shape as every other role in 0003.
-- ============================================================================

insert into public.roles (key, name, description, rank, is_system, organization_id) values
  ('litigation_clerk', 'Litigation Clerk', 'Court filings, service of process and hearing logistics', 62, true, null)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view', 'notifications.view', 'calendar.view',
  'matters.view',
  'hearings.view',
  'tasks.view', 'tasks.update',
  'documents.view', 'documents.upload',
  'billing.view', 'expenses.manage',
  'messaging.view', 'messaging.send'
)
where r.key = 'litigation_clerk'
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0074_audit_log_fixes.sql
-- ============================================================
-- ============================================================================
-- Migration 0074 — Two audit-log correctness fixes found during UAT.
--
-- 1. "Someone" instead of a real name in Recent Activity: several Edge
--    Functions call log_audit() through the SERVICE-ROLE client (admin-
--    create-user, summarize-matter) — auth.uid() is always null in that
--    context, even though the function already knows exactly who the real
--    caller is (it authenticated them earlier via the caller-scoped
--    client). log_audit() gains an optional p_actor_id override so those
--    call sites can pass the real person through instead of losing their
--    identity. paystack-webhook's own log_audit calls are left as-is —
--    those genuinely have no human actor (Paystack triggered them), so a
--    null actor there is correct, not a bug.
--
-- 2. Platform admins could see every organization's ENTIRE internal audit
--    trail (matters created, clients added, everything) at all times, not
--    just their own platform-level actions — audit_select's `is_platform_
--    admin() or (...)` was a blanket bypass with no session scoping at all.
--    The app already has real, tracked Support Sessions (0017) for exactly
--    this — a platform admin should only see a firm's internal activity
--    while genuinely inside an active, audited support session for that
--    firm, the same way a human support agent would only see what they're
--    actively working on. Rewritten so has_permission()/is_org_admin()
--    (which both have their own internal is_platform_admin() bypass — see
--    0002) are never even evaluated for a platform admin, closing that
--    loophole rather than papering over it.
-- ============================================================================

create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_platform boolean default false,
  p_actor_id uuid default null
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
  values (p_org, coalesce(p_actor_id, auth.uid()), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_platform)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb, boolean, uuid) to authenticated;

drop policy if exists "audit_select" on public.audit_logs;

create policy "audit_select" on public.audit_logs
  for select using (
    (
      public.is_platform_admin()
      and (
        is_platform_action
        or exists (
          select 1 from public.support_sessions ss
          where ss.organization_id = audit_logs.organization_id
            and ss.admin_id = auth.uid()
            and ss.ended_at is null
            and ss.expires_at > now()
        )
      )
    )
    or (
      not public.is_platform_admin()
      and not is_platform_action
      and (
        actor_id = auth.uid()
        or public.is_org_admin(organization_id)
        or public.has_permission(organization_id, 'audit.read')
      )
    )
  );

-- ============================================================
-- ==> supabase/migrations/0075_hr_module_enum_prep.sql
-- ============================================================
-- ============================================================================
-- Migration 0075 — HR & People Management, Part 1: enum prep.
--
-- Split into its own migration and run/committed on its own — Postgres
-- refuses to let a brand-new enum value be used in the same transaction
-- that added it (see 0072/0073 for the same lesson learned earlier today).
-- Everything that actually USES these values lives in 0076 onward, which
-- must be run strictly after this one has committed.
--
-- New HR roles: hr_administrator, hr_manager, hr_officer. "Recruiter" and
-- a standalone "Employee" role are deliberately deferred — every existing
-- role already IS an employee (self-service leave/documents/requests is
-- granted broadly to every role in 0076, not tied to a new role), and
-- Recruiter belongs with the Recruitment module itself, in a later phase
-- per the module's own prioritization (Employees -> Leave -> HR Requests
-- -> Documents -> Onboarding -> Permissions -> Notifications first).
-- ============================================================================

alter type public.role_key add value if not exists 'hr_administrator';
alter type public.role_key add value if not exists 'hr_manager';
alter type public.role_key add value if not exists 'hr_officer';

-- New notification category for HR events (leave approved, HR request
-- updated, announcement, etc.) — same additive pattern 0061 used to add
-- 'messaging'.
alter type public.notification_category add value if not exists 'hr';

-- ============================================================
-- ==> supabase/migrations/0076_hr_module_roles_permissions.sql
-- ============================================================
-- ============================================================================
-- Migration 0076 — HR & People Management, Part 2: permissions + roles.
--
-- Must run AFTER 0075 has committed (uses the enum values added there).
--
-- Reuses existing permission keys wherever the existing catalog already
-- covers the concern, per the module's own "do not duplicate existing
-- functionality" instruction:
--   - staff.view / staff.manage  -> employee directory + employee editing
--   - departments.view / departments.manage -> departments AND job titles
--     (job titles are managed the same way departments are; no separate
--     key needed for a second small reference-data list)
--   - reports.view -> already granted to the existing 'hr' role
--   - messaging.view/send -> already exists, reused for HR announcements'
--     in-app-notification channel
--
-- New keys only for concerns nothing existing covers: leave, HR documents
-- (deliberately separate from the general documents.* keys — an HR
-- document must never be reachable through the legal Documents module),
-- HR requests, onboarding, and HR announcements.
--
-- The existing 'hr' role (0003, still assignable, rank 66) is left
-- completely untouched — nothing here modifies or removes it, so any firm
-- already using it keeps working exactly as before. hr_administrator,
-- hr_manager and hr_officer are a more granular hierarchy firms can use
-- instead of (or alongside) it.
--
-- Simplification, flagged rather than silently built wrong: the spec asks
-- for HR Officer to "process" (not approve) leave/requests as a narrower
-- action than HR Manager's approve/reject. The permission model here only
-- has one leave.manage / hr_requests.manage gate, not a three-tier one —
-- HR Officer gets the same manage-level access as HR Administrator for
-- leave/requests/documents/onboarding/announcements, but NOT staff.manage
-- (cannot edit/delete employee records) or departments.manage, matching
-- the spec's explicit "should NOT be able to: delete employees, change
-- critical HR settings." A true approve-vs-process distinction would need
-- its own follow-up if it matters in practice.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('leave.request',          'leave',          'request', 'Submit and view your own leave requests'),
  ('leave.manage',           'leave',          'manage',  'Approve, reject and configure leave for the firm'),
  ('hr_documents.view_own',  'hr_documents',   'view_own','View your own HR documents'),
  ('hr_documents.manage',    'hr_documents',   'manage',  'Upload and manage any employee''s HR documents'),
  ('hr_requests.submit',     'hr_requests',    'submit',  'Submit your own HR requests'),
  ('hr_requests.manage',     'hr_requests',    'manage',  'Process and update any employee''s HR requests'),
  ('onboarding.manage',      'onboarding',     'manage',  'Assign and manage employee onboarding checklists'),
  ('hr_announcements.manage','hr_announcements','manage', 'Create and send HR announcements'),
  ('hr.view_reports',        'hr',             'view_reports', 'View HR dashboard and reports')
on conflict (key) do nothing;

insert into public.roles (key, name, description, rank, is_system, organization_id) values
  ('hr_administrator', 'HR Administrator', 'Manages employees, departments, leave, documents and onboarding', 63, true, null),
  ('hr_manager',        'HR Manager',       'Full HR administration plus leave approval and HR analytics', 64, true, null),
  ('hr_officer',        'HR Officer',       'Day-to-day HR processing — cannot delete employees or change HR settings', 67, true, null)
on conflict (key) do nothing;

-- hr_administrator and hr_manager: identical grant set for now — the
-- spec's "plus" items for Manager (recruitment, performance, disciplinary
-- records, HR settings) belong to modules not yet built (Phase 2+); this
-- keeps the two roles behaviorally distinct in name/hierarchy today
-- without inventing permissions for features that don't exist yet.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view', 'notifications.view', 'calendar.view',
  'members.view', 'staff.view', 'staff.manage',
  'departments.view', 'departments.manage',
  'reports.view', 'hr.view_reports',
  'leave.request', 'leave.manage',
  'hr_documents.view_own', 'hr_documents.manage',
  'hr_requests.submit', 'hr_requests.manage',
  'onboarding.manage', 'hr_announcements.manage',
  'messaging.view', 'messaging.send'
)
where r.key in ('hr_administrator', 'hr_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view', 'notifications.view', 'calendar.view',
  'staff.view', 'departments.view',
  'leave.request', 'leave.manage',
  'hr_documents.view_own', 'hr_documents.manage',
  'hr_requests.submit', 'hr_requests.manage',
  'onboarding.manage', 'hr_announcements.manage',
  'messaging.view', 'messaging.send'
)
where r.key = 'hr_officer'
on conflict do nothing;

-- Baseline self-service — every firm role (including the new HR roles
-- themselves) can request their own leave, see their own HR documents,
-- and submit their own HR requests, regardless of their legal-practice
-- permissions. Platform roles are excluded — platform staff aren't a
-- firm's employees.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('leave.request', 'hr_documents.view_own', 'hr_requests.submit')
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0077_hr_module_employees_schema.sql
-- ============================================================
-- ============================================================================
-- Migration 0077 — HR & People Management, Part 3: Departments, Job Titles,
-- and the Employees data model.
--
-- Employees are NOT a new table — profiles + memberships already identify
-- every person, and staff_profiles (0014) already exists as the 1:1
-- "firm-specific professional data" extension of a profile (bar number,
-- qualifications, hourly rate, etc.). This extends that same table with
-- the HR fields the module needs, instead of creating a second, competing
-- "employees" table that would duplicate name/email/avatar (already on
-- profiles) and create two sources of truth for the same person.
-- ============================================================================

create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.departments enable row level security;
create policy "departments_select" on public.departments
  for select using (public.has_permission(organization_id, 'departments.view'));
create policy "departments_write" on public.departments
  for all using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage'));

-- Job titles are configured the same way departments are (small,
-- org-managed reference lists) — reusing the departments.* permission
-- pair rather than adding a near-identical second one.
create table public.job_titles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.job_titles enable row level security;
create policy "job_titles_select" on public.job_titles
  for select using (public.has_permission(organization_id, 'departments.view'));
create policy "job_titles_write" on public.job_titles
  for all using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage'));

alter table public.staff_profiles
  add column if not exists employee_code text,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists job_title_id uuid references public.job_titles(id) on delete set null,
  add column if not exists manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'intern')),
  add column if not exists employment_status text not null default 'active'
    check (employment_status in ('applicant', 'onboarding', 'active', 'on_leave', 'suspended', 'resigned', 'terminated', 'former_employee')),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists office_branch text,
  add column if not exists address text,
  add column if not exists date_of_birth date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists work_email citext;

-- Employment-controlled fields (everything HR owns) are locked against
-- self-editing — the existing staff_profiles_write policy already lets a
-- user update their OWN row (for the personal fields: bio, phone, address,
-- availability, emergency contact, date of birth), but without this
-- trigger they could also silently promote their own department/title/
-- status/manager/pay rate through the exact same row-level access. Only
-- staff.manage holders (HR roles, leadership) can actually change these.
create or replace function public.protect_employment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(new.organization_id, 'staff.manage') then
    new.employee_code := old.employee_code;
    new.department_id := old.department_id;
    new.job_title_id := old.job_title_id;
    new.manager_id := old.manager_id;
    new.employment_type := old.employment_type;
    new.employment_status := old.employment_status;
    new.start_date := old.start_date;
    new.end_date := old.end_date;
    new.office_branch := old.office_branch;
    new.work_email := old.work_email;
    new.hourly_rate := old.hourly_rate;
    new.bar_number := old.bar_number;
    new.year_admitted := old.year_admitted;
    new.qualifications := old.qualifications;
    new.specializations := old.specializations;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_employment_fields on public.staff_profiles;
create trigger trg_protect_employment_fields
  before update on public.staff_profiles
  for each row execute function public.protect_employment_fields();

-- ============================================================
-- ==> supabase/migrations/0078_hr_module_leave.sql
-- ============================================================
-- ============================================================================
-- Migration 0078 — HR & People Management, Part 4: Leave Management.
--
-- Entitlements are org-configurable (leave_types.default_entitlement_days),
-- never hardcoded. Balances only change on APPROVAL, not on request —
-- matches the module spec exactly ("When leave is approved: update leave
-- balance"). Status transitions (approve/reject/cancel) are RPC-only, no
-- raw UPDATE policy on leave_requests — same "sensitive transition ->
-- RPC, not a raw policy" posture used throughout this app (delete_channel,
-- clear_audit_log, cancel_subscription, etc.), so every transition is
-- guaranteed to also write an audit_logs row and a notification.
-- ============================================================================

create table public.leave_types (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete cascade,
  name                      text not null,
  default_entitlement_days  integer not null default 0,
  requires_approval         boolean not null default true,
  created_at                timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.leave_types enable row level security;
create policy "leave_types_select" on public.leave_types
  for select using (public.has_permission(organization_id, 'leave.request') or public.has_permission(organization_id, 'leave.manage'));
create policy "leave_types_write" on public.leave_types
  for all using (public.has_permission(organization_id, 'leave.manage'))
  with check (public.has_permission(organization_id, 'leave.manage'));

create table public.leave_balances (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  leave_type_id     uuid not null references public.leave_types(id) on delete cascade,
  year              integer not null,
  entitlement_days  numeric(6,2) not null default 0,
  used_days         numeric(6,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, user_id, leave_type_id, year)
);
alter table public.leave_balances enable row level security;
create policy "leave_balances_select" on public.leave_balances
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'leave.manage'));
-- No insert/update policy — only request_leave()/review_leave_request() below ever touch balances.

create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types(id) on delete restrict,
  start_date      date not null,
  end_date        date not null,
  days            numeric(6,2) not null,
  reason          text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  review_comment  text,
  created_at      timestamptz not null default now(),
  check (end_date >= start_date)
);
create index idx_leave_requests_org_user on public.leave_requests (organization_id, user_id, created_at desc);

alter table public.leave_requests enable row level security;
create policy "leave_requests_select" on public.leave_requests
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'leave.manage'));
create policy "leave_requests_insert" on public.leave_requests
  for insert with check (
    user_id = auth.uid() and status = 'pending'
    and public.has_permission(organization_id, 'leave.request')
  );
-- No update/delete policy — review_leave_request() and cancel_leave_request() below are the only way status changes.

create or replace function public.request_leave(
  p_org uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  -- Notify anyone in the org who can approve leave — best-effort fan-out,
  -- kept simple (in-app only) for this phase; multi-channel (email/
  -- WhatsApp) HR notifications are a follow-up, same as the existing
  -- task-reminder engine's channel dispatch but generalized for HR events.
  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid()
    and public.has_permission(p_org, 'leave.manage');

  return rec;
end;
$$;

create or replace function public.review_leave_request(
  p_request uuid,
  p_approve boolean,
  p_comment text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_year int;
begin
  select * into rec from public.leave_requests where id = p_request;
  if rec.id is null then
    raise exception 'Leave request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'leave.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  update public.leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_comment = p_comment
  where id = p_request
  returning * into rec;

  if p_approve then
    v_year := extract(year from rec.start_date)::int;
    insert into public.leave_balances (organization_id, user_id, leave_type_id, year, entitlement_days, used_days)
    values (
      rec.organization_id, rec.user_id, rec.leave_type_id, v_year,
      coalesce((select default_entitlement_days from public.leave_types where id = rec.leave_type_id), 0),
      rec.days
    )
    on conflict (organization_id, user_id, leave_type_id, year)
    do update set used_days = public.leave_balances.used_days + excluded.used_days, updated_at = now();
  end if;

  perform public.log_audit(rec.organization_id, case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id, case when p_approve then 'Leave approved' else 'Leave rejected' end,
    jsonb_build_object('comment', p_comment));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id,
    case when p_approve then 'Your leave request was approved' else 'Your leave request was rejected' end,
    'info');

  return rec;
end;
$$;

create or replace function public.cancel_leave_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  update public.leave_requests
  set status = 'cancelled'
  where id = p_request and user_id = auth.uid() and status = 'pending'
  returning organization_id into v_org;

  if v_org is null then
    raise exception 'Nothing to cancel — this request no longer exists, isn''t yours, or has already been reviewed';
  end if;

  perform public.log_audit(v_org, 'leave.cancelled', 'leave_request', p_request, 'Leave request cancelled');
end;
$$;

grant execute on function public.request_leave(uuid, uuid, date, date, text) to authenticated;
grant execute on function public.review_leave_request(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_leave_request(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0079_hr_module_requests.sql
-- ============================================================
-- ============================================================================
-- Migration 0079 — HR & People Management, Part 5: HR Requests.
--
-- Deliberately separate from Leave (0078) — leave has its own balance/
-- entitlement machinery; a request for an employment letter or a salary
-- certificate doesn't. Status changes go through update_hr_request_status()
-- rather than a raw policy, same audit/notification guarantee as leave.
-- ============================================================================

create table public.hr_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  request_type    text not null check (request_type in (
                     'employment_letter', 'salary_certificate', 'personal_info_change',
                     'hr_document_request', 'equipment_request', 'workplace_issue', 'other'
                   )),
  subject         text not null,
  details         text,
  status          text not null default 'submitted' check (status in (
                     'submitted', 'in_review', 'in_progress', 'approved', 'rejected', 'completed'
                   )),
  handled_by      uuid references public.profiles(id) on delete set null,
  handled_at      timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now()
);
create index idx_hr_requests_org_status on public.hr_requests (organization_id, status, created_at desc);

alter table public.hr_requests enable row level security;
create policy "hr_requests_select" on public.hr_requests
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'hr_requests.manage'));
create policy "hr_requests_insert" on public.hr_requests
  for insert with check (
    user_id = auth.uid() and status = 'submitted'
    and public.has_permission(organization_id, 'hr_requests.submit')
  );
-- No update/delete policy — update_hr_request_status() is the only transition path.

create or replace function public.update_hr_request_status(
  p_request uuid,
  p_status text,
  p_note text default null
)
returns public.hr_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_requests;
begin
  if p_status not in ('in_review', 'in_progress', 'approved', 'rejected', 'completed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select * into rec from public.hr_requests where id = p_request;
  if rec.id is null then
    raise exception 'HR request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'hr_requests.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.hr_requests
  set status = p_status, handled_by = auth.uid(), handled_at = now(), resolution_note = coalesce(p_note, resolution_note)
  where id = p_request
  returning * into rec;

  perform public.log_audit(rec.organization_id, 'hr_request.updated', 'hr_request', rec.id,
    format('HR request marked %s', p_status), jsonb_build_object('note', p_note));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'hr_request.updated',
    'hr_request', rec.id, format('Your request "%s" is now %s', rec.subject, replace(p_status, '_', ' ')), 'info');

  return rec;
end;
$$;

grant execute on function public.update_hr_request_status(uuid, text, text) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0080_hr_module_documents.sql
-- ============================================================
-- ============================================================================
-- Migration 0080 — HR & People Management, Part 6: HR Documents.
--
-- A separate table AND a separate, non-public storage bucket from the
-- legal Documents module (documents / 'documents' bucket) — an HR
-- document (contract, ID, warning letter) must never be reachable through
-- the general Documents page or its RLS, even for someone with
-- documents.view. Only HR roles upload/manage; an employee can only ever
-- see their own.
-- ============================================================================

create table public.hr_employee_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  category        text not null check (category in (
                     'employment_contract', 'identification', 'professional_certificate', 'bar_certificate',
                     'nda', 'policy_acknowledgement', 'performance_review', 'warning_letter',
                     'employment_letter', 'other'
                   )),
  display_name    text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index idx_hr_employee_documents_org_user on public.hr_employee_documents (organization_id, user_id, created_at desc);

alter table public.hr_employee_documents enable row level security;
create policy "hr_employee_documents_select" on public.hr_employee_documents
  for select using (
    public.has_permission(organization_id, 'hr_documents.manage')
    or (user_id = auth.uid() and public.has_permission(organization_id, 'hr_documents.view_own'))
  );
create policy "hr_employee_documents_write" on public.hr_employee_documents
  for all using (public.has_permission(organization_id, 'hr_documents.manage'))
  with check (public.has_permission(organization_id, 'hr_documents.manage'));

insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;

-- Path convention: {organization_id}/{user_id}/{uuid}-{filename} — the
-- same folder-encodes-ownership pattern org-logos (0017) already uses.
create policy "hr_documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'hr-documents'
    and (
      public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.manage')
      or (
        ((storage.foldername(name))[2])::uuid = auth.uid()
        and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.view_own')
      )
    )
  );
create policy "hr_documents_storage_insert" on storage.objects
  for insert with check (bucket_id = 'hr-documents' and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.manage'));
create policy "hr_documents_storage_delete" on storage.objects
  for delete using (bucket_id = 'hr-documents' and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_documents.manage'));

-- ============================================================
-- ==> supabase/migrations/0081_hr_module_extend_existing_hr_role.sql
-- ============================================================
-- ============================================================================
-- Migration 0081 — Extend the existing 'hr' role with the new HR module's
-- permissions.
--
-- 0076 deliberately left the pre-existing 'hr' role (0003, already
-- assignable, already has an active test account in use) completely
-- untouched while adding the new hr_administrator/hr_manager/hr_officer
-- hierarchy alongside it. On reflection, leaving a role literally named
-- "HR" unable to approve leave, manage HR documents, or process HR
-- requests — capabilities its own name implies — is a confusing gap, not
-- a safe default. This purely ADDS the new module's manager-level grants
-- to it; nothing already granted to 'hr' is touched or removed.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'leave.manage', 'hr_documents.manage', 'hr_requests.manage',
  'onboarding.manage', 'hr_announcements.manage', 'hr.view_reports'
)
where r.key = 'hr'
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0082_hr_module_onboarding.sql
-- ============================================================
-- ============================================================================
-- Migration 0082 — HR & People Management, Part 7: Employee Onboarding.
--
-- Genuinely integrated with the existing Tasks module, not a parallel
-- checklist system — each onboarding template item becomes a real row in
-- public.tasks (assigned to the new employee, their manager, or HR,
-- depending on the item), so it shows up in that person's normal task
-- list/dashboard/notifications exactly like any other task. Progress
-- ("6/9 completed") is just counting linked tasks by status, via
-- onboarding_task_links — no separate completion-tracking to keep in sync.
-- ============================================================================

create table public.onboarding_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  -- [{ "label": "Employment contract signed", "assignee": "employee" }, ...]
  -- assignee is one of 'employee' | 'manager' | 'hr' (resolved to a real
  -- user_id at assignment time in assign_onboarding() below).
  items           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.onboarding_templates enable row level security;
create policy "onboarding_templates_select" on public.onboarding_templates
  for select using (public.has_permission(organization_id, 'onboarding.manage'));
create policy "onboarding_templates_write" on public.onboarding_templates
  for all using (public.has_permission(organization_id, 'onboarding.manage'))
  with check (public.has_permission(organization_id, 'onboarding.manage'));

create table public.employee_onboarding (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  template_id     uuid not null references public.onboarding_templates(id) on delete restrict,
  assigned_by     uuid references public.profiles(id) on delete set null,
  assigned_at     timestamptz not null default now()
);
alter table public.employee_onboarding enable row level security;
create policy "employee_onboarding_select" on public.employee_onboarding
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'onboarding.manage'));
-- No insert/update policy — assign_onboarding() is the only way one of these is created.

create table public.onboarding_task_links (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  employee_onboarding_id uuid not null references public.employee_onboarding(id) on delete cascade,
  task_id               uuid not null references public.tasks(id) on delete cascade
);
alter table public.onboarding_task_links enable row level security;
create policy "onboarding_task_links_select" on public.onboarding_task_links
  for select using (
    exists (
      select 1 from public.employee_onboarding eo
      where eo.id = employee_onboarding_id
        and (eo.user_id = auth.uid() or public.has_permission(eo.organization_id, 'onboarding.manage'))
    )
  );

create or replace function public.assign_onboarding(p_org uuid, p_user uuid, p_template uuid)
returns public.employee_onboarding
language plpgsql
security definer
set search_path = public
as $$
declare
  eo public.employee_onboarding;
  v_manager uuid;
  v_item jsonb;
  v_assignee_hint text;
  v_assignee uuid;
  v_task_id uuid;
begin
  if not public.has_permission(p_org, 'onboarding.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  select manager_id into v_manager from public.staff_profiles where organization_id = p_org and user_id = p_user;

  insert into public.employee_onboarding (organization_id, user_id, template_id, assigned_by)
  values (p_org, p_user, p_template, auth.uid())
  returning * into eo;

  for v_item in select * from jsonb_array_elements((select items from public.onboarding_templates where id = p_template))
  loop
    v_assignee_hint := coalesce(v_item ->> 'assignee', 'employee');
    v_assignee := case
      when v_assignee_hint = 'manager' and v_manager is not null then v_manager
      when v_assignee_hint = 'hr' then auth.uid()
      else p_user
    end;

    insert into public.tasks (organization_id, title, status, priority, assignee_id, created_by)
    values (p_org, coalesce(v_item ->> 'label', 'Onboarding task'), 'todo', 'medium', v_assignee, auth.uid())
    returning id into v_task_id;

    insert into public.onboarding_task_links (organization_id, employee_onboarding_id, task_id)
    values (p_org, eo.id, v_task_id);
  end loop;

  perform public.log_audit(p_org, 'onboarding.assigned', 'employee_onboarding', eo.id,
    'Onboarding checklist assigned', jsonb_build_object('template_id', p_template, 'user_id', p_user));

  perform public.notify_user(p_org, p_user, auth.uid(), 'hr', 'onboarding.assigned',
    'employee_onboarding', eo.id, 'Your onboarding checklist is ready', 'info');

  return eo;
end;
$$;

grant execute on function public.assign_onboarding(uuid, uuid, uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0083_hr_module_announcements.sql
-- ============================================================
-- ============================================================================
-- Migration 0083 — HR & People Management, Part 8: HR Announcements.
--
-- Delivery goes through the existing notification infrastructure
-- (notify_user, category 'hr' — added in 0075) rather than a separate
-- system: every recipient gets a normal in-app notification the same way
-- leave/request updates already do. Email/WhatsApp multi-channel fan-out
-- (like the task reminder engine has) is a follow-up, not built here.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('hr_announcements.view', 'hr_announcements', 'view', 'View HR announcements')
on conflict (key) do nothing;

-- Baseline — every firm role can read announcements addressed to them,
-- same reasoning as leave.request/hr_requests.submit in 0076.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'hr_announcements.view'
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;

create table public.hr_announcements (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  title                  text not null,
  body                   text not null,
  audience_type          text not null default 'organization'
                           check (audience_type in ('organization', 'department', 'employees', 'branch')),
  audience_department_id uuid references public.departments(id) on delete set null,
  audience_user_ids      uuid[] not null default '{}',
  audience_branch        text,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now()
);
create index idx_hr_announcements_org on public.hr_announcements (organization_id, created_at desc);

alter table public.hr_announcements enable row level security;
create policy "hr_announcements_select" on public.hr_announcements
  for select using (public.has_permission(organization_id, 'hr_announcements.view'));
-- No insert policy — send_hr_announcement() is the only way one is created (it also has to fan out notifications atomically with the row).

create or replace function public.send_hr_announcement(
  p_org uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_department_id uuid default null,
  p_user_ids uuid[] default null,
  p_branch text default null
)
returns public.hr_announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_announcements;
  recipient record;
begin
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch') then
    raise exception 'Invalid audience type: %', p_audience_type;
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids, audience_branch, created_by)
  values (p_org, p_title, p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'), p_branch, auth.uid())
  returning * into rec;

  for recipient in
    select m.user_id
    from public.memberships m
    left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
    where m.organization_id = p_org
      and m.status = 'active'
      and (
        p_audience_type = 'organization'
        or (p_audience_type = 'department' and sp.department_id = p_department_id)
        or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
        or (p_audience_type = 'branch' and sp.office_branch = p_branch)
      )
  loop
    perform public.notify_user(p_org, recipient.user_id, auth.uid(), 'hr', 'hr.announcement',
      'hr_announcement', rec.id, p_title, 'info');
  end loop;

  perform public.log_audit(p_org, 'hr.announcement_sent', 'hr_announcement', rec.id,
    format('Announcement sent: %s', p_title), jsonb_build_object('audience_type', p_audience_type));

  return rec;
end;
$$;

grant execute on function public.send_hr_announcement(uuid, text, text, text, uuid, uuid[], text) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0084_hr_module_defaults_and_role_audience.sql
-- ============================================================
-- ============================================================================
-- Migration 0084 — HR & People Management: seed sensible defaults, and let
-- announcements target by role.
--
-- 1. Leave types and departments were never seeded anywhere — new orgs got
--    empty dropdowns with no way to fill them in (no UI existed either).
--    A trigger seeds sensible defaults on every future organization
--    (self-service registration, platform-admin manual creation — every
--    path, not just one), and a one-time backfill does the same for orgs
--    that already exist. Everything seeded is fully editable/deletable —
--    these are starting points, not fixed values (never hardcode
--    entitlements, per the module's own instruction).
--
-- 2. hr_announcements.audience_type gains 'role' — targeting "everyone
--    with role X" needs no setup (roles already exist), unlike
--    departments which a firm has to configure first.
-- ============================================================================

create or replace function public.seed_hr_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leave_types (organization_id, name, default_entitlement_days) values
    (new.id, 'Annual Leave', 20),
    (new.id, 'Sick Leave', 10),
    (new.id, 'Casual Leave', 5),
    (new.id, 'Maternity Leave', 90),
    (new.id, 'Paternity Leave', 10),
    (new.id, 'Compassionate Leave', 5),
    (new.id, 'Study Leave', 10),
    (new.id, 'Exam Leave', 5)
  on conflict (organization_id, name) do nothing;

  insert into public.departments (organization_id, name) values
    (new.id, 'Corporate'),
    (new.id, 'Litigation'),
    (new.id, 'Family'),
    (new.id, 'Real Estate'),
    (new.id, 'Finance'),
    (new.id, 'Administration'),
    (new.id, 'Human Resources'),
    (new.id, 'IT')
  on conflict (organization_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_seed_hr_defaults on public.organizations;
create trigger trg_seed_hr_defaults
  after insert on public.organizations
  for each row execute function public.seed_hr_defaults();

-- One-time backfill for organizations that already exist.
insert into public.leave_types (organization_id, name, default_entitlement_days)
select o.id, v.name, v.days
from public.organizations o
cross join (values
  ('Annual Leave', 20), ('Sick Leave', 10), ('Casual Leave', 5), ('Maternity Leave', 90),
  ('Paternity Leave', 10), ('Compassionate Leave', 5), ('Study Leave', 10), ('Exam Leave', 5)
) as v(name, days)
on conflict (organization_id, name) do nothing;

insert into public.departments (organization_id, name)
select o.id, v.name
from public.organizations o
cross join (values
  ('Corporate'), ('Litigation'), ('Family'), ('Real Estate'),
  ('Finance'), ('Administration'), ('Human Resources'), ('IT')
) as v(name)
on conflict (organization_id, name) do nothing;

-- ----------------------------------------------------------------------------
-- Announcements: add 'role' as a targetable audience.
-- ----------------------------------------------------------------------------
alter table public.hr_announcements drop constraint if exists hr_announcements_audience_type_check;
alter table public.hr_announcements add constraint hr_announcements_audience_type_check
  check (audience_type in ('organization', 'department', 'employees', 'branch', 'role'));
alter table public.hr_announcements add column if not exists audience_role_key public.role_key;

-- CREATE OR REPLACE only replaces a function whose argument list matches
-- exactly — adding a new parameter here would otherwise leave the OLD
-- 7-argument version in place as a separate overload (dead code the
-- frontend's existing call, which doesn't pass p_role_key, would keep
-- silently hitting instead of this one).
drop function if exists public.send_hr_announcement(uuid, text, text, text, uuid, uuid[], text);

create or replace function public.send_hr_announcement(
  p_org uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_department_id uuid default null,
  p_user_ids uuid[] default null,
  p_branch text default null,
  p_role_key public.role_key default null
)
returns public.hr_announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_announcements;
  recipient record;
begin
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch', 'role') then
    raise exception 'Invalid audience type: %', p_audience_type;
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids, audience_branch, audience_role_key, created_by)
  values (p_org, p_title, p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'), p_branch, p_role_key, auth.uid())
  returning * into rec;

  for recipient in
    select m.user_id
    from public.memberships m
    left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
    left join public.roles r on r.id = m.role_id
    where m.organization_id = p_org
      and m.status = 'active'
      and (
        p_audience_type = 'organization'
        or (p_audience_type = 'department' and sp.department_id = p_department_id)
        or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
        or (p_audience_type = 'branch' and sp.office_branch = p_branch)
        or (p_audience_type = 'role' and r.key = p_role_key)
      )
  loop
    perform public.notify_user(p_org, recipient.user_id, auth.uid(), 'hr', 'hr.announcement',
      'hr_announcement', rec.id, p_title, 'info');
  end loop;

  perform public.log_audit(p_org, 'hr.announcement_sent', 'hr_announcement', rec.id,
    format('Announcement sent: %s', p_title), jsonb_build_object('audience_type', p_audience_type));

  return rec;
end;
$$;

grant execute on function public.send_hr_announcement(uuid, text, text, text, uuid, uuid[], text, public.role_key) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0085_hr_module_self_approval_and_no_default_limits.sql
-- ============================================================
-- ============================================================================
-- Migration 0085 — HR & People Management: block self-approval, and stop
-- inventing leave entitlement numbers.
--
-- 1. Nothing previously stopped an HR-access holder from approving their
--    own leave/HR request. Both RPCs now block that — UNLESS the approver
--    is Managing Partner or Partner, who fall back as the approver when
--    the requester IS the (only) HR person, per explicit instruction.
--
-- 2. The entitlement numbers seeded in 0084 (20/10/5/90/...) were this
--    session's own invented defaults, not the firm's real policy. Reset
--    to 0 for every leave type — HR sets real numbers via the 'Manage
--    lists' section (now with an editable Limit field), nothing assumed.
-- ============================================================================

create or replace function public.review_leave_request(
  p_request uuid,
  p_approve boolean,
  p_comment text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_year int;
  v_is_leadership boolean;
begin
  select * into rec from public.leave_requests where id = p_request;
  if rec.id is null then
    raise exception 'Leave request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'leave.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if rec.user_id = auth.uid() then
    select exists (
      select 1 from public.memberships m join public.roles r on r.id = m.role_id
      where m.organization_id = rec.organization_id and m.user_id = auth.uid()
        and r.key in ('managing_partner', 'partner')
    ) into v_is_leadership;
    if not v_is_leadership then
      raise exception 'You cannot approve your own leave request — ask another HR-access holder, or a Managing Partner/Partner.';
    end if;
  end if;

  update public.leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_comment = p_comment
  where id = p_request
  returning * into rec;

  if p_approve then
    v_year := extract(year from rec.start_date)::int;
    insert into public.leave_balances (organization_id, user_id, leave_type_id, year, entitlement_days, used_days)
    values (
      rec.organization_id, rec.user_id, rec.leave_type_id, v_year,
      coalesce((select default_entitlement_days from public.leave_types where id = rec.leave_type_id), 0),
      rec.days
    )
    on conflict (organization_id, user_id, leave_type_id, year)
    do update set used_days = public.leave_balances.used_days + excluded.used_days, updated_at = now();
  end if;

  perform public.log_audit(rec.organization_id, case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id, case when p_approve then 'Leave approved' else 'Leave rejected' end,
    jsonb_build_object('comment', p_comment));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id,
    case when p_approve then 'Your leave request was approved' else 'Your leave request was rejected' end,
    'info');

  return rec;
end;
$$;

create or replace function public.update_hr_request_status(
  p_request uuid,
  p_status text,
  p_note text default null
)
returns public.hr_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_requests;
  v_is_leadership boolean;
begin
  if p_status not in ('in_review', 'in_progress', 'approved', 'rejected', 'completed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select * into rec from public.hr_requests where id = p_request;
  if rec.id is null then
    raise exception 'HR request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'hr_requests.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  if rec.user_id = auth.uid() then
    select exists (
      select 1 from public.memberships m join public.roles r on r.id = m.role_id
      where m.organization_id = rec.organization_id and m.user_id = auth.uid()
        and r.key in ('managing_partner', 'partner')
    ) into v_is_leadership;
    if not v_is_leadership then
      raise exception 'You cannot process your own HR request — ask another HR-access holder, or a Managing Partner/Partner.';
    end if;
  end if;

  update public.hr_requests
  set status = p_status, handled_by = auth.uid(), handled_at = now(), resolution_note = coalesce(p_note, resolution_note)
  where id = p_request
  returning * into rec;

  perform public.log_audit(rec.organization_id, 'hr_request.updated', 'hr_request', rec.id,
    format('HR request marked %s', p_status), jsonb_build_object('note', p_note));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'hr_request.updated',
    'hr_request', rec.id, format('Your request "%s" is now %s', rec.subject, replace(p_status, '_', ' ')), 'info');

  return rec;
end;
$$;

-- Stop assuming entitlement numbers — reset to 0, HR sets real values.
update public.leave_types set default_entitlement_days = 0;

create or replace function public.seed_hr_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leave_types (organization_id, name, default_entitlement_days) values
    (new.id, 'Annual Leave', 0),
    (new.id, 'Sick Leave', 0),
    (new.id, 'Casual Leave', 0),
    (new.id, 'Maternity Leave', 0),
    (new.id, 'Paternity Leave', 0),
    (new.id, 'Compassionate Leave', 0),
    (new.id, 'Study Leave', 0),
    (new.id, 'Exam Leave', 0)
  on conflict (organization_id, name) do nothing;

  insert into public.departments (organization_id, name) values
    (new.id, 'Corporate'),
    (new.id, 'Litigation'),
    (new.id, 'Family'),
    (new.id, 'Real Estate'),
    (new.id, 'Finance'),
    (new.id, 'Administration'),
    (new.id, 'Human Resources'),
    (new.id, 'IT')
  on conflict (organization_id, name) do nothing;

  return new;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0086_fix_log_audit_ambiguous_overloads.sql
-- ============================================================
-- ============================================================================
-- Migration 0086 — Fix log_audit() ambiguous-overload bug.
--
-- Three separate versions of log_audit() have been piling up since 0021:
-- a 6-argument one (0004), a 7-argument one (0021), and an 8-argument one
-- (0074, this session). Each later migration used CREATE OR REPLACE with
-- a DIFFERENT argument count, which in Postgres creates a new overload
-- rather than replacing the old one — the exact mistake explicitly caught
-- and avoided for send_hr_announcement() in 0084, but missed here. With
-- three overloads live, a call using fewer than 8 arguments can become
-- ambiguous ("function log_audit(...) is not unique"), which is exactly
-- what broke leave requests (request_leave() calls log_audit with 6
-- positional arguments internally).
--
-- Fix: drop the two obsolete overloads, leaving exactly one authoritative
-- 8-argument version.
-- ============================================================================

drop function if exists public.log_audit(uuid, text, text, uuid, text, jsonb);
drop function if exists public.log_audit(uuid, text, text, uuid, text, jsonb, boolean);

create or replace function public.log_audit(
  p_org uuid,
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_platform boolean default false,
  p_actor_id uuid default null
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
  values (p_org, coalesce(p_actor_id, auth.uid()), p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'::jsonb), p_platform)
  returning * into rec;
  return rec;
end;
$$;

grant execute on function public.log_audit(uuid, text, text, uuid, text, jsonb, boolean, uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0087_leave_enforce_balance.sql
-- ============================================================
-- ============================================================================
-- Migration 0087 — Enforce the configured leave limit at request time, and
-- fix the "notify approvers" fan-out.
--
-- 1. request_leave() previously never checked remaining balance — any
--    request could be submitted regardless of how many days were left,
--    leaving it entirely to the approver's judgment. Now it computes the
--    same limit/taken/balance the summary table shows and rejects a
--    request that would exceed what's actually left, with a clear message
--    stating exactly how many days remain.
--
-- 2. The notify-approvers loop used has_permission(p_org, 'leave.manage')
--    inside the WHERE clause of a query fanning out over OTHER users —
--    has_permission() always checks the CALLING user (auth.uid()), not
--    whichever membership row the query is currently looking at. So it
--    evaluated to one constant true/false for the entire loop based on
--    the REQUESTER's own permission: if the requester happened to also
--    hold leave.manage, literally everyone in the org got notified; if
--    not (the normal case), nobody did. Replaced with a direct check of
--    each candidate's own role_permissions.
-- ============================================================================

create or replace function public.request_leave(
  p_org uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
  v_year int;
  v_limit numeric(6,2);
  v_taken numeric(6,2);
  v_type_name text;
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);
  v_year := extract(year from p_start)::int;

  select name into v_type_name from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_type_name is null then
    raise exception 'Unknown leave type';
  end if;

  select coalesce(b.entitlement_days, t.default_entitlement_days), coalesce(b.used_days, 0)
    into v_limit, v_taken
    from public.leave_types t
    left join public.leave_balances b
      on b.organization_id = p_org and b.user_id = auth.uid() and b.leave_type_id = p_leave_type and b.year = v_year
    where t.id = p_leave_type;

  if v_days > (v_limit - v_taken) then
    raise exception '% requires % day(s), but only % day(s) remain of your % limit', v_type_name, v_days, (v_limit - v_taken), v_limit;
  end if;

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions perm on perm.id = rp.permission_id and perm.key = 'leave.manage'
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid();

  return rec;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0088_leave_realtime.sql
-- ============================================================
-- ============================================================================
-- Migration 0088 — Add leave_requests to the realtime publication.
--
-- Needed for the sidebar's live "pending leave" badge — without this, the
-- badge's postgres_changes subscription would never fire, silently never
-- updating until the next manual refetch (page navigation). Same guarded
-- pattern 0061 used for the messaging tables.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests'
  ) then
    alter publication supabase_realtime add table public.leave_requests;
  end if;
end $$;

-- ============================================================
-- ==> supabase/migrations/0089_hr_grants_for_leadership.sql
-- ============================================================
-- ============================================================================
-- Migration 0089 — Grant the HR module's permissions to Managing Partner
-- and Partner.
--
-- 0076 granted the new HR permissions (hr.view_reports, leave.manage,
-- hr_documents.manage, hr_requests.manage, onboarding.manage,
-- hr_announcements.manage) only to the new hr_administrator/hr_manager
-- roles and, later (0081), the pre-existing 'hr' role. Managing Partner
-- and Partner — "runs the firm; full access" / senior leadership — were
-- never given them, so the firm's own top roles hit "Access restricted"
-- entering HR Workspace while a dedicated HR Administrator could get in
-- fine. Purely additive; nothing already granted to either role is touched.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'hr.view_reports', 'leave.manage', 'hr_documents.manage',
  'hr_requests.manage', 'onboarding.manage', 'hr_announcements.manage'
)
where r.key in ('managing_partner', 'partner')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0090_onboarding_view_own.sql
-- ============================================================
-- ============================================================================
-- Migration 0090 — let every employee see their OWN onboarding checklist.
--
-- The Onboarding page under HR Workspace was gated entirely behind
-- 'onboarding.manage', so only HR/leadership could even open it — a new
-- hire assigned a checklist had no way to see it there at all (their
-- checklist items only ever showed up as ordinary rows in their Tasks
-- list, with nothing in HR Workspace explaining what they were for).
--
-- employee_onboarding's own SELECT policy (0082) already allows
-- `user_id = auth.uid()` — a regular employee could always query their
-- own assignment. This was purely a missing permission key to gate the
-- nav item/route on, not an RLS gap.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('onboarding.view_own', 'onboarding', 'view_own', 'View your own onboarding checklist progress')
on conflict (key) do nothing;

-- Baseline self-service, same shape as leave.request/hr_documents.view_own/
-- hr_requests.submit in 0076 — every firm role, platform roles excluded.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'onboarding.view_own'
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;

-- ============================================================
-- ==> supabase/migrations/0091_onboarding_unassign_and_task_realtime.sql
-- ============================================================
-- ============================================================================
-- Migration 0091 — unassign onboarding + live task-completion status.
--
-- Two related fixes:
--
-- 1. "0/1 completed" never updated when the assignee actually finished
--    their task — the Onboarding page's progress queries are plain
--    TanStack Query fetches (30s staleTime, no window-focus refetch), so
--    completing a linked task in the Tasks module never told anyone
--    looking at the Onboarding page. Adding public.tasks to the realtime
--    publication lets the frontend subscribe to task UPDATEs and
--    invalidate the onboarding progress queries live.
--
-- 2. No way to remove a checklist that was assigned by mistake — only the
--    unused *template* could be deleted (0090-era ChecklistsCard), not an
--    actual assignment. unassign_onboarding() removes the
--    employee_onboarding row AND the real tasks it generated (not just
--    the links — an orphaned "Onboarding" task with no visible checklist
--    behind it would be confusing to leave in someone's task list).
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

create or replace function public.unassign_onboarding(p_onboarding_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_user uuid;
  v_template uuid;
begin
  select organization_id, user_id, template_id into v_org, v_user, v_template
  from public.employee_onboarding where id = p_onboarding_id;

  if v_org is null then
    raise exception 'Onboarding assignment not found';
  end if;
  if not public.has_permission(v_org, 'onboarding.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  -- Removes the linked tasks outright (cascades their onboarding_task_links
  -- rows too) rather than leaving orphaned "Onboarding" tasks with no
  -- checklist behind them once the assignment itself is gone.
  delete from public.tasks
  where id in (select task_id from public.onboarding_task_links where employee_onboarding_id = p_onboarding_id);

  delete from public.employee_onboarding where id = p_onboarding_id;

  perform public.log_audit(v_org, 'onboarding.unassigned', 'employee_onboarding', p_onboarding_id,
    'Onboarding checklist unassigned', jsonb_build_object('template_id', v_template, 'user_id', v_user));
end;
$$;

grant execute on function public.unassign_onboarding(uuid) to authenticated;

-- ============================================================
-- ==> supabase/migrations/0092_hr_roles_no_practice_dashboard.sql
-- ============================================================
-- ============================================================================
-- Migration 0092 — HR roles shouldn't see the fee-earner practice Dashboard
-- or the Practice > Calendar item; they have their own dashboard and their
-- own calendar-equivalent (the leave calendar) inside HR Workspace.
--
-- Root cause: 0076 copied the fee-earner-style baseline list
-- ('dashboard.view, notifications.view, calendar.view, ...') when granting
-- hr_administrator/hr_manager/hr_officer, so they picked up practice-shell
-- access nothing in HR Workspace actually needs. The legacy 'hr' role
-- (0003) never had calendar.view, but did have dashboard.view — same fix
-- applies to it too.
--
-- dashboard.view gone means '/' no longer renders the practice Dashboard
-- for these roles (see WorkspaceHome in router.tsx, which now redirects an
-- hr.view_reports holder without dashboard.view straight to /hr instead).
-- ============================================================================

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key in ('hr', 'hr_administrator', 'hr_manager', 'hr_officer')
  and p.key in ('dashboard.view', 'calendar.view');

-- ============================================================
-- ==> supabase/migrations/0093_secretary_receptionist_split.sql
-- ============================================================
-- ============================================================================
-- Migration 0093 — split Secretary from Receptionist; let Secretary
-- actually schedule hearings.
--
-- Both roles were seeded identically in 0003 (front-office bundle: view
-- matters/clients/documents/hearings, manage tasks) — no real distinction
-- between "supports specific lawyers/matters" (Secretary) and "front-desk,
-- client-facing" (Receptionist). Splitting them:
--
--   Secretary   — keeps everything it had, PLUS hearings.create/update
--                 (it could only ever view a hearing before; scheduling
--                 one is squarely a secretarial task, and calendar.view
--                 already lets it see the result).
--   Receptionist — narrowed to Calendar + Tasks + Clients only. Loses
--                 matters.view, documents.view, hearings.view — a
--                 front-desk role has no reason to see case files, matter
--                 detail, or hearing schedules.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('hearings.create', 'hearings.update')
where r.key = 'secretary'
on conflict do nothing;

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key = 'receptionist'
  and p.key in ('matters.view', 'documents.view', 'hearings.view');

-- ============================================================
-- ==> supabase/migrations/0094_expenses_invoice_fk.sql
-- ============================================================
-- ============================================================================
-- Migration 0094 — the Expenses tab has never actually worked: expenses.
-- invoice_id was declared as a bare `uuid` since 0016, with no real foreign
-- key to invoices. The frontend's EXP_SELECT embeds it as
-- `invoice:invoices(id, invoice_number)` (to show a "Billed · INV-xxxx"
-- badge) — without a real FK, PostgREST can't resolve that relationship at
-- all and the WHOLE query 400s, for every expense, for every user,
-- unconditionally. There was no error state anywhere on that query (same
-- class of silent failure as the log_audit and matter_assignments bugs
-- this session), so it just always rendered as an empty "No expenses
-- match this view" — confirmed live: a correctly-written, fully org/
-- matter/user-scoped expense row existed in the table and was invisible
-- to every single role, including Managing Partner.
--
-- time_entries.invoice_id has the exact same gap (same migration, same
-- missing constraint) — nothing currently embeds it, so it hasn't broken
-- anything yet, but it's the same latent bug and gets the same fix here
-- rather than waiting to be found the same way.
--
-- Defensive null-out first in case any invoice_id ever pointed at a
-- deleted invoice — the app's own void/delete-invoice logic already nulls
-- these out (0048), so this should be a no-op, but it's cheap insurance
-- against ADD CONSTRAINT failing on unexpectedly orphaned data.
-- ============================================================================

update public.expenses e
set invoice_id = null
where invoice_id is not null and not exists (select 1 from public.invoices i where i.id = e.invoice_id);

update public.time_entries t
set invoice_id = null
where invoice_id is not null and not exists (select 1 from public.invoices i where i.id = t.invoice_id);

alter table public.expenses
  add constraint expenses_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete set null;

alter table public.time_entries
  add constraint time_entries_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete set null;

-- ============================================================
-- ==> supabase/migrations/0095_fix_hearing_notify_cast.sql
-- ============================================================
-- ============================================================================
-- Migration 0095 — fix "function notify_matter_team(...) does not exist"
-- when editing a hearing.
--
-- Root cause: track_hearing_modified() builds the priority argument with
-- `case when kind = 'hearing_cancelled' then 'warning' else 'info' end`.
-- Postgres resolves a CASE expression's type from its branches BEFORE it
-- knows what the surrounding function call expects — with two plain string
-- literal branches, that resolves to `text`, not the "unknown" type a bare
-- literal would have. `text` cannot implicitly cast to a custom enum
-- (notification_priority) during function-argument matching, so Postgres
-- can't find any matching overload of notify_matter_team and reports it as
-- not existing at all — even though the correct one is right there.
--
-- track_hearing_scheduled() and track_hearing_deleted() pass a bare
-- literal ('info' / 'warning') with no CASE, so they never hit this — this
-- is exactly why *creating* a hearing worked but *editing* one didn't.
--
-- Fixed by explicitly casting every notify_matter_team argument in all
-- three functions, closing off this whole class of "which literal is
-- 'unknown' vs already-typed" ambiguity for good, not just this one spot.
-- ============================================================================

create or replace function public.track_hearing_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  actor uuid := coalesce(new.created_by, auth.uid());
  title text;
begin
  if new.matter_id is not null then
    select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;
    select full_name into actor_name from public.profiles where id = actor;
    title := public.hearing_notification_title('scheduled', actor_name, matter_number, matter_title, new.title, new.hearing_at, new.court);

    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, actor, 'hearing_scheduled',
            'Scheduled hearing: ' || new.title || ' on ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI'),
            jsonb_build_object('hearing_id', new.id));

    perform public.notify_matter_team(new.organization_id, new.matter_id, actor,
      'hearings'::public.notification_category, 'hearing.scheduled'::text, 'matter'::text, new.matter_id, title,
      'info'::public.notification_priority);
  end if;
  return new;
end $$;

create or replace function public.track_hearing_modified()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  title text;
  kind text;
  verb text;
  summary text;
begin
  if new.matter_id is null then return new; end if;

  if new.hearing_at is distinct from old.hearing_at then
    kind := 'hearing_rescheduled'; verb := 'rescheduled';
  elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    kind := 'hearing_cancelled'; verb := 'cancelled';
  elsif new.title is distinct from old.title
     or new.court is distinct from old.court
     or new.judge is distinct from old.judge
     or new.location is distinct from old.location
     or new.type is distinct from old.type
     or new.status is distinct from old.status
     or new.outcome is distinct from old.outcome
     or new.notes is distinct from old.notes
     or new.duration_minutes is distinct from old.duration_minutes then
    kind := 'hearing_updated'; verb := 'updated';
  else
    return new; -- nothing meaningful changed (e.g. only updated_at)
  end if;

  select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = new.matter_id;
  select full_name into actor_name from public.profiles where id = auth.uid();
  title := public.hearing_notification_title(verb, actor_name, matter_number, matter_title, new.title, new.hearing_at, new.court);

  summary := case kind
    when 'hearing_rescheduled' then 'Rescheduled hearing: ' || new.title || ' to ' || to_char(new.hearing_at, 'FMMon DD, YYYY HH24:MI')
    when 'hearing_cancelled' then 'Cancelled hearing: ' || new.title || ' (was ' || to_char(old.hearing_at, 'FMMon DD, YYYY HH24:MI') || ')'
    else 'Updated hearing: ' || new.title
  end;

  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, auth.uid(), kind, summary, jsonb_build_object('hearing_id', new.id));

  perform public.notify_matter_team(new.organization_id, new.matter_id, auth.uid(),
    'hearings'::public.notification_category, ('hearing.' || replace(kind, 'hearing_', ''))::text, 'matter'::text, new.matter_id, title,
    (case when kind = 'hearing_cancelled' then 'warning' else 'info' end)::public.notification_priority);

  return new;
end $$;

create or replace function public.track_hearing_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  matter_number text;
  title text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;

  select m.title, m.matter_number into matter_title, matter_number from public.matters m where m.id = old.matter_id;
  select full_name into actor_name from public.profiles where id = auth.uid();
  title := public.hearing_notification_title('removed', actor_name, matter_number, matter_title, old.title, old.hearing_at, old.court);

  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'hearing_deleted',
    'Removed hearing: ' || old.title || ' (was ' || to_char(old.hearing_at, 'FMMon DD, YYYY HH24:MI') || ')',
    jsonb_build_object('hearing_id', old.id));

  perform public.notify_matter_team(old.organization_id, old.matter_id, auth.uid(),
    'hearings'::public.notification_category, 'hearing.deleted'::text, 'matter'::text, old.matter_id, title,
    'warning'::public.notification_priority);

  return old;
end $$;

-- ============================================================
-- ==> supabase/migrations/0096_fix_trial_cron_notify_cast.sql
-- ============================================================
-- ============================================================================
-- Migration 0096 — same bug class as 0095, found while sweeping every
-- notify_user/notify_matter_team/notify_org_members call site for it:
-- run_daily_subscription_checks()'s trial-reminder branch builds the
-- priority argument with
-- `case when r.days_left <= 3 then 'urgent' when r.days_left <= 7 then
-- 'warning' else 'reminder' end` — an unqualified CASE resolves to text,
-- which can't implicitly cast to notification_priority, so
-- notify_org_members(...) fails to resolve every single time this cron
-- tries to send a trial-reminder notification (30/14/7/3/1 days left).
-- This has been silently broken since 0055 first introduced it — it runs
-- on a schedule with no user watching, so nothing ever surfaced it.
--
-- Redefines the LIVE version of the function (0067's, which itself
-- superseded 0055's — this is not a revert, it keeps 0067's seat-sync
-- behavior intact and only adds the missing casts).
-- ============================================================================

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

  -- Scheduled downgrades taking effect on their billing date — plan_id AND
  -- seats both move to the new plan together, never just one of them.
  update public.subscriptions s
  set plan_id = s.scheduled_plan_id,
      seats = coalesce(p.max_users, 5),
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

-- ============================================================
-- ==> supabase/migrations/0097_hr_announcements_edit_delete.sql
-- ============================================================
-- ============================================================================
-- Migration 0097 — let anyone who can send an HR announcement edit or
-- delete one too. hr_announcements only ever had a SELECT policy (0083) —
-- send_hr_announcement() was deliberately the only way a row got created,
-- but nothing was ever added for update/delete, so an announcement was
-- permanent once sent, with no way to fix a typo or pull a mistaken one.
--
-- Gated on hr_announcements.manage (the same permission that gates
-- sending), not restricted to the original sender — matches how every
-- other HR "manage" permission in this app works (any leave.manage holder
-- can review any leave request, not just ones addressed to them).
--
-- Deliberately not touching audience/recipients on update — notifications
-- were already fanned out to the original audience at send time, so
-- changing who it's addressed to after the fact wouldn't retroactively
-- notify/un-notify anyone. The frontend only exposes title/body for
-- editing; this policy allows more, but that's a client-side choice, not
-- a security boundary that needs enforcing here.
-- ============================================================================

create policy "hr_announcements_update" on public.hr_announcements
  for update
  using (public.has_permission(organization_id, 'hr_announcements.manage'))
  with check (public.has_permission(organization_id, 'hr_announcements.manage'));

create policy "hr_announcements_delete" on public.hr_announcements
  for delete using (public.has_permission(organization_id, 'hr_announcements.manage'));

-- ============================================================
-- ==> supabase/migrations/0098_hearing_reminder_engine.sql
-- ============================================================
-- ============================================================================
-- Migration 0098 — Hearing Reminder Engine.
--
-- Mirrors the task reminder engine (0057-0059) exactly, for hearings: a
-- pg_cron job runs hourly, finds every still-pending hearing (scheduled or
-- adjourned, not held/cancelled) approaching its time, and dispatches a
-- 24-hours-before and a 1-hour-before reminder to everyone on the matter's
-- team (lead lawyer + matter_assignments — the same recipient set
-- notify_matter_team, 0047, already uses for immediate hearing
-- notifications). Each reminder goes in-app (always) plus email/WhatsApp
-- per-recipient preference, through the same notification_log +
-- send-task-notification Edge Function pipeline tasks already use.
--
-- Unlike tasks (date-only due_date, so 0059 has to assume a fixed 17:00 UTC
-- deadline), hearings already have a real hearing_at timestamptz — no
-- assumption needed, the reminder math is exact.
-- ============================================================================

alter table public.hearings
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz;

alter table public.notification_log
  add column if not exists hearing_id uuid references public.hearings(id) on delete cascade;
create index if not exists idx_notification_log_hearing on public.notification_log (hearing_id);

-- notification_type check was implicit (free text) for tasks; hearing types
-- reuse the same task_channel_prefs jsonb shape under a new key so no
-- backfill is needed — dispatch_hearing_notification's own coalesce below
-- already defaults to "on" when a user's prefs predate this key.
update public.notification_preferences
set task_channel_prefs = task_channel_prefs || '{"hearing_reminder": {"email": true, "whatsapp": true}}'::jsonb
where not (task_channel_prefs ? 'hearing_reminder');

alter table public.notification_preferences
  alter column task_channel_prefs set default '{
    "assigned":   {"email": true, "whatsapp": true},
    "due_soon":   {"email": true, "whatsapp": true},
    "overdue":    {"email": true, "whatsapp": true},
    "completed":  {"email": true, "whatsapp": true},
    "reassigned": {"email": true, "whatsapp": true},
    "hearing_reminder": {"email": true, "whatsapp": true}
  }'::jsonb;

-- ----------------------------------------------------------------------------
-- dispatch_hearing_notification — one recipient, one reminder. Mirrors
-- dispatch_task_notification's shape (0059) but targets a hearing; reuses
-- the exact same send-task-notification Edge Function (it now branches on
-- hearing_id vs task_id — see that function's own updated header comment).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_hearing_notification(
  p_hearing_id uuid,
  p_user_id uuid,
  p_type text,              -- 'hearing_reminder_24h' | 'hearing_reminder_1h'
  p_title text,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  prefs record;
  base_url text;
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
begin
  select id, organization_id into h from public.hearings where id = p_hearing_id;
  if h.id is null or p_user_id is null then
    return;
  end if;

  -- In-app: always fires, same "critical channel" posture as tasks.
  perform public.notify_user(h.organization_id, p_user_id, p_actor, 'hearings', p_type, 'hearing', p_hearing_id, p_title, 'reminder');

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'whatsapp')::boolean, true);

  if not send_email and not send_whatsapp then
    return;
  end if;

  base_url := current_setting('app.settings.supabase_url', true);
  svc_key := current_setting('app.settings.service_role_key', true);

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if base_url is null or svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (missing app.settings.supabase_url / service_role_key).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if base_url is null or svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (missing app.settings.supabase_url / service_role_key).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- run_hearing_reminders — the hourly tick. hearing_at is a real timestamptz
-- (unlike tasks' date-only due_date), so the 24h/1h windows are exact, no
-- fixed-deadline assumption needed.
-- ----------------------------------------------------------------------------
create or replace function public.run_hearing_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  recipient record;
  title text;
  matter_number text;
begin
  for h in
    select id, matter_id, title, hearing_at, court, reminder_24h_sent_at, reminder_1h_sent_at
    from public.hearings
    where status in ('scheduled', 'adjourned')
      and hearing_at > now()
  loop
    matter_number := null;
    if h.matter_id is not null then
      select m.matter_number into matter_number from public.matters m where m.id = h.matter_id;
    end if;

    if h.reminder_24h_sent_at is null and now() >= h.hearing_at - interval '24 hours' then
      title := 'Hearing tomorrow: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');

      for recipient in
        select m.lead_lawyer_id as user_id from public.matters m where m.id = h.matter_id and m.lead_lawyer_id is not null
        union
        select ma.user_id from public.matter_assignments ma where ma.matter_id = h.matter_id
      loop
        perform public.dispatch_hearing_notification(h.id, recipient.user_id, 'hearing_reminder_24h', title);
      end loop;
      update public.hearings set reminder_24h_sent_at = now() where id = h.id;
    end if;

    if h.reminder_1h_sent_at is null and now() >= h.hearing_at - interval '1 hour' then
      title := 'Hearing in 1 hour: "' || h.title || '"' || coalesce(' — ' || matter_number, '')
        || ' at ' || to_char(h.hearing_at, 'FMMon DD, HH24:MI') || coalesce(', ' || h.court, '');

      for recipient in
        select m.lead_lawyer_id as user_id from public.matters m where m.id = h.matter_id and m.lead_lawyer_id is not null
        union
        select ma.user_id from public.matter_assignments ma where ma.matter_id = h.matter_id
      loop
        perform public.dispatch_hearing_notification(h.id, recipient.user_id, 'hearing_reminder_1h', title);
      end loop;
      update public.hearings set reminder_1h_sent_at = now() where id = h.id;
    end if;
  end loop;
end;
$$;

select cron.schedule('hearing-reminders', '5 * * * *', $$select public.run_hearing_reminders();$$);

-- ============================================================
-- ==> supabase/migrations/0099_reminder_engine_use_vault.sql
-- ============================================================
-- ============================================================================
-- Migration 0099 — fix "permission denied to set parameter" on hosted
-- Supabase. ALTER DATABASE ... SET for a custom setting (what 0059
-- originally asked for) requires real Postgres superuser, which hosted
-- Supabase projects' SQL editor role doesn't have — that command can never
-- succeed there, regardless of what's pasted or who runs it.
--
-- Fixed by reading the service-role key from Supabase Vault instead (the
-- supported way to store a secret a SECURITY DEFINER function can read back
-- via SQL — vault.create_secret()/vault.decrypted_secrets, available by
-- default on every Supabase project).
--
-- The project URL was never actually secret — it's already public in the
-- frontend's own config — so it's hardcoded directly below instead of
-- adding a second moving part for something that never needed protecting.
--
-- ONE-TIME MANUAL STEP (cannot be embedded in a migration file — this is a
-- live secret, never something that belongs in a git-committed file). Run
-- this once in the SQL editor, with your real service-role key pasted in
-- place of the placeholder:
--   select vault.create_secret('PASTE_YOUR_SERVICE_ROLE_KEY_HERE', 'service_role_key');
-- ============================================================================

create or replace function public.dispatch_task_notification(
  p_task_id uuid,
  p_user_id uuid,
  p_type text,
  p_priority public.notification_priority,
  p_channel_key text,
  p_actor uuid default null,
  p_title text default null,
  p_log_timeline boolean default false,
  p_repeat_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  prefs record;
  base_url text := 'https://hkqmhcpnmlydkhzrgojd.supabase.co';
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
  fn_title text;
begin
  select id, organization_id, matter_id, title into t from public.tasks where id = p_task_id;
  if t.id is null or p_user_id is null then
    return;
  end if;

  fn_title := coalesce(p_title, t.title);

  perform public.notify_task_event(t.organization_id, t.id, t.matter_id, p_user_id, p_actor, p_type, fn_title, p_priority);

  if p_log_timeline and not p_repeat_only and t.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (t.organization_id, t.matter_id, p_actor,
      case when p_type = 'task_overdue' then 'task_overdue' else 'task_reminder_sent' end,
      fn_title);
  end if;

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'whatsapp')::boolean, true);

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

create or replace function public.dispatch_hearing_notification(
  p_hearing_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  prefs record;
  base_url text := 'https://hkqmhcpnmlydkhzrgojd.supabase.co';
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
begin
  select id, organization_id into h from public.hearings where id = p_hearing_id;
  if h.id is null or p_user_id is null then
    return;
  end if;

  perform public.notify_user(h.organization_id, p_user_id, p_actor, 'hearings', p_type, 'hearing', p_hearing_id, p_title, 'reminder');

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'whatsapp')::boolean, true);

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0100_plan_feature_foundation.sql
-- ============================================================
-- ============================================================================
-- Migration 0100 — Plan-Based Feature Gating, Part A: foundation.
--
-- Only two things have ever been genuinely plan-gated: seat count
-- (max_users) and AI matter summarization (ai_summarization, added 0070).
-- Everything else — the highlights marketing bullets, and the Platform
-- Console's PLAN_FEATURES checklist — is decorative, and the checklist
-- itself is stale (lists features from the original 0006 seed that were
-- never built: case_management, sso, api_access, custom_branding,
-- advanced_security, document_versioning, ai_features — none ever
-- checked anywhere in the app). It doesn't even include ai_summarization,
-- the one key that IS real.
--
-- This migration adds org_has_feature() — mirrors has_permission(org,
-- perm)'s exact shape (0002) — and replaces plans.features with an
-- accurate, small vocabulary of things that actually exist in the app:
-- messaging, whatsapp_reminders, hr_module, ai_summarization. Part B
-- (0101) wires these into real enforcement.
--
-- Deliberately NOT gated (stated here, not just omitted, so it's a
-- decision): role availability (Litigation Clerk, HR roles, etc. — an
-- org-structure choice, not a premium feature), Reports depth (no actual
-- basic/advanced split exists in the built Reports page despite
-- highlights implying one), storage limits (no usage-tracking exists to
-- enforce against yet).
-- ============================================================================

create or replace function public.org_has_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select (p.features ->> p_feature)::boolean
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.organization_id = p_org
  ), false);
$$;

-- Full replace, not merge — the old keys are dead weight nothing reads.
update public.plans set
  features = '{"messaging": false, "whatsapp_reminders": false, "hr_module": false, "ai_summarization": false}'::jsonb
where key = 'starter';

update public.plans set
  features = '{"messaging": true, "whatsapp_reminders": true, "hr_module": false, "ai_summarization": false}'::jsonb
where key = 'professional';

update public.plans set
  features = '{"messaging": true, "whatsapp_reminders": true, "hr_module": true, "ai_summarization": true}'::jsonb
where key in ('business', 'enterprise');

-- Marketing copy catches up to what's now actually enforced (and to
-- modules built after 0053 originally wrote these: HR, Messaging).
update public.plans set
  highlights = array[
    'Up to 3 users', 'Core matter management', 'Client management', 'Contacts', 'Documents',
    'Hearings & Calendar', 'Tasks', 'Email notifications', 'Time tracking', 'Expenses',
    'Basic billing & invoicing', 'Basic reports'
  ]
where key = 'starter';

update public.plans set
  highlights = array[
    'Up to 10 users', 'Everything in Starter', 'Team messaging (channels + DMs)',
    'Email + WhatsApp reminders', 'Advanced billing', 'Advanced reports',
    'Increased document storage', 'Priority support'
  ]
where key = 'professional';

update public.plans set
  highlights = array[
    'Up to 25 users', 'Everything in Professional', 'HR & People Management',
    'AI-powered matter summaries', 'More storage', 'Advanced firm controls', 'Priority support'
  ]
where key = 'business';

update public.plans set
  highlights = array[
    'Custom number of users', 'Everything in Business', 'Custom storage',
    'Custom integrations', 'Custom support requirements'
  ]
where key = 'enterprise';

-- ============================================================
-- ==> supabase/migrations/0101_plan_gate_enforcement.sql
-- ============================================================
-- ============================================================================
-- Migration 0101 — Plan-Based Feature Gating, Part B: enforcement.
--
-- Enforcement boundary: gate the ability to CREATE new activity in a
-- gated module, not historical read access — matches the app's existing
-- convention (a closed matter stays fully readable, just not writable).
-- If a firm downgrades, old messages/HR records aren't yanked away, they
-- just can't make new ones.
--
-- For HR specifically this means: gate the "create new" entry points
-- (request_leave, hr_requests' own insert policy, assign_onboarding,
-- send_hr_announcement, and the departments/job_titles/leave_types config
-- writes) — but deliberately NOT review_leave_request() or
-- update_hr_request_status(), which resolve an EXISTING pending item.
-- Gating those would strand a request submitted while the org still had
-- HR access, permanently unresolvable after a downgrade — the opposite of
-- the "don't punish historical data" principle this whole migration is
-- built around.
--
-- The frontend route guard (App-side, not this migration) is the primary
-- UX gate for HR — these DB-level checks are defense-in-depth against a
-- direct API call, not the main experience.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Messaging — gate the three "create new" policies + the DM-creation RPC.
--    Existing conversations/messages stay fully readable either way (their
--    _select policies are untouched).
-- ----------------------------------------------------------------------------
drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels
  for insert with check (
    public.has_permission(organization_id, 'messaging.create_channels')
    and created_by = auth.uid()
    and public.org_has_feature(organization_id, 'messaging')
  );

drop policy if exists "channel_messages_insert" on public.channel_messages;
create policy "channel_messages_insert" on public.channel_messages
  for insert with check (
    public.has_permission(organization_id, 'messaging.send')
    and author_id = auth.uid()
    and exists (select 1 from public.channels c where c.id = channel_id and c.organization_id = organization_id and c.archived_at is null)
    and public.org_has_feature(organization_id, 'messaging')
  );

drop policy if exists "direct_messages_insert" on public.direct_messages;
create policy "direct_messages_insert" on public.direct_messages
  for insert with check (
    author_id = auth.uid()
    and public.has_permission(organization_id, 'messaging.send')
    and exists (
      select 1 from public.direct_conversations dc
      where dc.id = conversation_id and dc.organization_id = organization_id and auth.uid() in (dc.user_a, dc.user_b)
    )
    and public.org_has_feature(organization_id, 'messaging')
  );

create or replace function public.get_or_create_dm_conversation(p_org uuid, p_other uuid)
returns public.direct_conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  rec public.direct_conversations;
begin
  if auth.uid() is null or p_other is null or p_other = auth.uid() then
    raise exception 'Invalid conversation participants';
  end if;
  if not public.is_org_member(p_org) then
    raise exception 'You are not a member of this organization';
  end if;
  if not public.org_has_feature(p_org, 'messaging') then
    raise exception 'Messaging is not included in your plan. Upgrade to Professional to use it.';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.user_id = p_other and m.organization_id = p_org and m.status = 'active'
  ) then
    raise exception 'That person is not a member of this organization';
  end if;

  a := least(auth.uid(), p_other);
  b := greatest(auth.uid(), p_other);

  select * into rec from public.direct_conversations where user_a = a and user_b = b;
  if rec.id is not null then
    return rec;
  end if;

  insert into public.direct_conversations (organization_id, user_a, user_b)
  values (p_org, a, b)
  returning * into rec;
  return rec;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. HR — config writes (departments/job titles/leave types) + the three
--    "create new" RPCs (request_leave, assign_onboarding,
--    send_hr_announcement) + hr_requests' own insert policy.
-- ----------------------------------------------------------------------------
drop policy if exists "departments_write" on public.departments;
create policy "departments_write" on public.departments
  for all
  using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage') and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists "job_titles_write" on public.job_titles;
create policy "job_titles_write" on public.job_titles
  for all
  using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage') and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists "leave_types_write" on public.leave_types;
create policy "leave_types_write" on public.leave_types
  for all
  using (public.has_permission(organization_id, 'leave.manage'))
  with check (public.has_permission(organization_id, 'leave.manage') and public.org_has_feature(organization_id, 'hr_module'));

drop policy if exists "hr_requests_insert" on public.hr_requests;
create policy "hr_requests_insert" on public.hr_requests
  for insert with check (
    user_id = auth.uid() and status = 'submitted'
    and public.has_permission(organization_id, 'hr_requests.submit')
    and public.org_has_feature(organization_id, 'hr_module')
  );

create or replace function public.request_leave(
  p_org uuid,
  p_leave_type uuid,
  p_start date,
  p_end date,
  p_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
  v_year int;
  v_limit numeric(6,2);
  v_taken numeric(6,2);
  v_type_name text;
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);
  v_year := extract(year from p_start)::int;

  select name into v_type_name from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_type_name is null then
    raise exception 'Unknown leave type';
  end if;

  select coalesce(b.entitlement_days, t.default_entitlement_days), coalesce(b.used_days, 0)
    into v_limit, v_taken
    from public.leave_types t
    left join public.leave_balances b
      on b.organization_id = p_org and b.user_id = auth.uid() and b.leave_type_id = p_leave_type and b.year = v_year
    where t.id = p_leave_type;

  if v_days > (v_limit - v_taken) then
    raise exception '% requires % day(s), but only % day(s) remain of your % limit', v_type_name, v_days, (v_limit - v_taken), v_limit;
  end if;

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions perm on perm.id = rp.permission_id and perm.key = 'leave.manage'
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid();

  return rec;
end;
$$;

create or replace function public.assign_onboarding(p_org uuid, p_user uuid, p_template uuid)
returns public.employee_onboarding
language plpgsql
security definer
set search_path = public
as $$
declare
  eo public.employee_onboarding;
  v_manager uuid;
  v_item jsonb;
  v_assignee_hint text;
  v_assignee uuid;
  v_task_id uuid;
begin
  if not public.has_permission(p_org, 'onboarding.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
  end if;

  select manager_id into v_manager from public.staff_profiles where organization_id = p_org and user_id = p_user;

  insert into public.employee_onboarding (organization_id, user_id, template_id, assigned_by)
  values (p_org, p_user, p_template, auth.uid())
  returning * into eo;

  for v_item in select * from jsonb_array_elements((select items from public.onboarding_templates where id = p_template))
  loop
    v_assignee_hint := coalesce(v_item ->> 'assignee', 'employee');
    v_assignee := case
      when v_assignee_hint = 'manager' and v_manager is not null then v_manager
      when v_assignee_hint = 'hr' then auth.uid()
      else p_user
    end;

    insert into public.tasks (organization_id, title, status, priority, assignee_id, created_by)
    values (p_org, coalesce(v_item ->> 'label', 'Onboarding task'), 'todo', 'medium', v_assignee, auth.uid())
    returning id into v_task_id;

    insert into public.onboarding_task_links (organization_id, employee_onboarding_id, task_id)
    values (p_org, eo.id, v_task_id);
  end loop;

  perform public.log_audit(p_org, 'onboarding.assigned', 'employee_onboarding', eo.id,
    'Onboarding checklist assigned', jsonb_build_object('template_id', p_template, 'user_id', p_user));

  perform public.notify_user(p_org, p_user, auth.uid(), 'hr', 'onboarding.assigned',
    'employee_onboarding', eo.id, 'Your onboarding checklist is ready', 'info');

  return eo;
end;
$$;

create or replace function public.send_hr_announcement(
  p_org uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_department_id uuid default null,
  p_user_ids uuid[] default null,
  p_branch text default null,
  p_role_key public.role_key default null
)
returns public.hr_announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_announcements;
  recipient record;
begin
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch', 'role') then
    raise exception 'Invalid audience type: %', p_audience_type;
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids, audience_branch, audience_role_key, created_by)
  values (p_org, p_title, p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'), p_branch, p_role_key, auth.uid())
  returning * into rec;

  for recipient in
    select m.user_id
    from public.memberships m
    left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
    left join public.roles r on r.id = m.role_id
    where m.organization_id = p_org
      and m.status = 'active'
      and (
        p_audience_type = 'organization'
        or (p_audience_type = 'department' and sp.department_id = p_department_id)
        or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
        or (p_audience_type = 'branch' and sp.office_branch = p_branch)
        or (p_audience_type = 'role' and r.key = p_role_key)
      )
  loop
    perform public.notify_user(p_org, recipient.user_id, auth.uid(), 'hr', 'hr.announcement',
      'hr_announcement', rec.id, p_title, 'info');
  end loop;

  perform public.log_audit(p_org, 'hr.announcement_sent', 'hr_announcement', rec.id,
    format('Announcement sent: %s', p_title), jsonb_build_object('audience_type', p_audience_type));

  return rec;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. WhatsApp — gate the WHATSAPP branch specifically in both dispatch
--    functions (0098/0099). Email stays ungated — it's baseline on every
--    plan.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_task_notification(
  p_task_id uuid,
  p_user_id uuid,
  p_type text,
  p_priority public.notification_priority,
  p_channel_key text,
  p_actor uuid default null,
  p_title text default null,
  p_log_timeline boolean default false,
  p_repeat_only boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
  prefs record;
  base_url text := 'https://hkqmhcpnmlydkhzrgojd.supabase.co';
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
  fn_title text;
begin
  select id, organization_id, matter_id, title into t from public.tasks where id = p_task_id;
  if t.id is null or p_user_id is null then
    return;
  end if;

  fn_title := coalesce(p_title, t.title);

  perform public.notify_task_event(t.organization_id, t.id, t.matter_id, p_user_id, p_actor, p_type, fn_title, p_priority);

  if p_log_timeline and not p_repeat_only and t.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (t.organization_id, t.matter_id, p_actor,
      case when p_type = 'task_overdue' then 'task_overdue' else 'task_reminder_sent' end,
      fn_title);
  end if;

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> p_channel_key ->> 'whatsapp')::boolean, true)
    and public.org_has_feature(t.organization_id, 'whatsapp_reminders');

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, task_id, notification_type, channel, status)
    values (t.organization_id, p_user_id, p_actor, t.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

create or replace function public.dispatch_hearing_notification(
  p_hearing_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
  prefs record;
  base_url text := 'https://hkqmhcpnmlydkhzrgojd.supabase.co';
  svc_key text;
  send_email boolean;
  send_whatsapp boolean;
  log_id uuid;
begin
  select id, organization_id into h from public.hearings where id = p_hearing_id;
  if h.id is null or p_user_id is null then
    return;
  end if;

  perform public.notify_user(h.organization_id, p_user_id, p_actor, 'hearings', p_type, 'hearing', p_hearing_id, p_title, 'reminder');

  select whatsapp_enabled, whatsapp_number, email_enabled, task_channel_prefs
    into prefs
    from public.notification_preferences where user_id = p_user_id;

  send_email := coalesce(prefs.email_enabled, false)
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'email')::boolean, true);
  send_whatsapp := coalesce(prefs.whatsapp_enabled, false) and prefs.whatsapp_number is not null
    and coalesce((prefs.task_channel_prefs -> 'hearing_reminder' ->> 'whatsapp')::boolean, true)
    and public.org_has_feature(h.organization_id, 'whatsapp_reminders');

  if not send_email and not send_whatsapp then
    return;
  end if;

  select decrypted_secret into svc_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if send_email then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'EMAIL', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;

  if send_whatsapp then
    insert into public.notification_log (organization_id, user_id, actor_id, hearing_id, notification_type, channel, status)
    values (h.organization_id, p_user_id, p_actor, h.id, p_type, 'WHATSAPP', 'PENDING')
    returning id into log_id;
    if svc_key is null then
      update public.notification_log set status = 'FAILED',
        failure_reason = 'Scheduler is not fully configured (service_role_key not set in Vault).'
        where id = log_id;
    else
      perform net.http_post(
        url := base_url || '/functions/v1/send-task-notification',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || svc_key),
        body := jsonb_build_object('notification_log_id', log_id)
      );
    end if;
  end if;
end;
$$;

-- ============================================================
-- ==> supabase/migrations/0102_matter_ai_chat.sql
-- ============================================================
-- ============================================================================
-- Migration 0102 — AI Chat: conversational follow-up on a matter, building
-- on the one-shot AI Matter Summary (0070). Per-user, not a shared team
-- thread — each lawyer's own conversation with the AI about a given
-- matter. Same plan gate as the summary (ai_summarization, Business+) —
-- this is "more AI on a matter," not a separate capability tier.
--
-- No insert/update/delete policy — the chat-with-matter Edge Function
-- (service-role) is the only writer, for both the user's message and the
-- AI's reply, inserted together in one call. Matches direct_conversations/
-- employee_onboarding's existing "RPC/Edge-Function-only" pattern in this
-- codebase — a client can never forge either side of the conversation.
-- ============================================================================

create table public.matter_ai_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index idx_matter_ai_chat_matter_user on public.matter_ai_chat_messages (matter_id, user_id, created_at);

alter table public.matter_ai_chat_messages enable row level security;

create policy "matter_ai_chat_messages_select" on public.matter_ai_chat_messages
  for select using (user_id = auth.uid() and public.has_matter_access(matter_id));
