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
