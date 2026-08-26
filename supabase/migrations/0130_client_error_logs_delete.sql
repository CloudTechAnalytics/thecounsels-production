-- ============================================================================
-- Migration 0130 — Let platform admins delete client_error_logs rows.
--
-- 0120 gave client_error_logs an INSERT policy (open — any client can
-- report an error) and a SELECT policy (platform-admin only), but no
-- DELETE at all. Needed now that a platform-admin viewer is being built:
-- dismissing a single resolved report, or clearing everything, both need
-- a real DELETE path — same posture as clear_audit_log (0062), scoped to
-- is_platform_admin() rather than a dedicated RPC since there's no
-- "write a confirmation entry back" requirement here like the audit log has.
-- ============================================================================

create policy client_error_logs_delete on public.client_error_logs
for delete
using (is_platform_admin());
