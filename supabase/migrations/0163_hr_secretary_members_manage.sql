-- ============================================================================
-- Migration 0163 — Grant members.manage to HR and Secretary.
--
-- Both roles previously had members.view only (0067), which meant anyone
-- registered or invited as HR/Secretary could see the team list but never
-- actually invite or remove anyone — including HR, whose whole job
-- description is "bring people into the firm." members.manage is what
-- is_org_admin() (0002) checks for insert/update/delete on memberships, so
-- this is what actually unlocks inviting/suspending/removing members for
-- both roles, not just a cosmetic permission-list change.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'members.manage'
where r.key in ('hr', 'secretary')
on conflict do nothing;
