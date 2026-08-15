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
