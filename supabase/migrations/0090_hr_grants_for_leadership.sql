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
