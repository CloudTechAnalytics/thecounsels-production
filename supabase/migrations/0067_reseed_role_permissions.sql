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
