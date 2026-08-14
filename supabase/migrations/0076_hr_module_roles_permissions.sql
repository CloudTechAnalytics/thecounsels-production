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
