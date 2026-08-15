-- ============================================================================
-- Migration 0090 — let every employee see their OWN onboarding checklist.
--
-- The Onboarding page under HR Workspace was gated entirely behind
-- 'onboarding.manage', so only HR/leadership could even open it — a new
-- hire assigned a checklist had no way to see it there at all (their
-- checklist items only ever showed up as ordinary rows in their Tasks
-- list, with nothing in HR Workspace explaining what they were for).
--
-- employee_onboarding's own SELECT policy (0082) already allows
-- `user_id = auth.uid()` — a regular employee could always query their
-- own assignment. This was purely a missing permission key to gate the
-- nav item/route on, not an RLS gap.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('onboarding.view_own', 'onboarding', 'view_own', 'View your own onboarding checklist progress')
on conflict (key) do nothing;

-- Baseline self-service, same shape as leave.request/hr_documents.view_own/
-- hr_requests.submit in 0076 — every firm role, platform roles excluded.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'onboarding.view_own'
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;
