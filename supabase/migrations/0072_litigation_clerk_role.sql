-- ============================================================================
-- Migration 0072 — New role: Litigation Clerk.
--
-- Covers court-facing logistics staff (filing at registries, serving
-- process, picking up/dropping off paperwork) who need a narrower slice of
-- access than a Paralegal (no client-record access) but still need to see
-- hearing schedules, log their own billable time/expenses, and update the
-- tasks assigned to them. No new tables or permission keys — every
-- permission granted here already exists; this only adds the role and its
-- grants, same shape as every other role in 0003.
-- ============================================================================

-- roles.key is a Postgres enum (public.role_key, defined in 0001), not free
-- text — the new value has to be added to the enum itself before any row
-- can use it.
alter type public.role_key add value if not exists 'litigation_clerk';

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
