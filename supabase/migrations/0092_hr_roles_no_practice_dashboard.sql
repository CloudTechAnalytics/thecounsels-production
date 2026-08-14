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
