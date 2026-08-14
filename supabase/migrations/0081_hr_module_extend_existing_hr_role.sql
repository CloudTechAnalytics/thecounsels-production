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
