-- ============================================================================
-- Migration 0164 — Grant members.view to Secretary.
--
-- Follow-up to 0163: Secretary got members.manage there, but the
-- Administration/Firm Settings route itself is gated on
-- members.view OR organization.view (router.tsx), neither of which
-- Secretary had. Without this, the members.manage grant is unreachable —
-- Secretary still can't get to the page that lets them use it. HR already
-- had members.view from 0067, so this is Secretary-only.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'members.view'
where r.key = 'secretary'
on conflict do nothing;
