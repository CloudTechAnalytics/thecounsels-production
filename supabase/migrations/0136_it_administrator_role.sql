-- ============================================================================
-- Migration 0136 — New system role: IT Administrator.
--
-- Deliberately shaped around least privilege, discussed and agreed in the
-- conversation this was built in: IT gets MORE system/configuration
-- access than almost any other role, but LESS case-content access than
-- even Secretary. Provisioning accounts, configuring branches, and
-- reviewing the audit log never requires opening a single matter.
--
-- members.manage in particular also makes this role the natural
-- gatekeeper for the support-session grant flow (0133) — grant_support_
-- session/deny_support_session check for is_owner OR members.manage
-- directly, not a dedicated permission key, so this falls out for free.
--
-- No matters.*/clients.*/documents.*/hearings.*/billing-invoices-payments-
-- trust/hr_* (beyond the same baseline every role gets)/messaging beyond
-- the same baseline — all deliberately withheld.
-- ============================================================================

insert into public.roles (key, name, description, rank, is_system)
values ('it_administrator', 'IT Administrator', 'System access, provisioning and security — no case content by design', 68, true);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  -- Same baseline every seeded role gets (basic app usage + being an
  -- HR-system participant themselves) — matches paralegal's own set.
  'calendar.view', 'dashboard.view', 'hr_announcements.view', 'hr_documents.view_own',
  'hr_requests.submit', 'leave.request', 'messaging.create_channels', 'messaging.send',
  'messaging.view', 'notifications.view', 'onboarding.view_own', 'staff.view',
  -- IT-specific: access provisioning, system configuration, security oversight.
  'members.view', 'members.manage',
  'branches.view', 'branches.manage',
  'staff.manage',
  'roles.view',
  'organization.view', 'organization.manage',
  'audit.read'
)
where r.key = 'it_administrator';
