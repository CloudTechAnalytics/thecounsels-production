-- ============================================================================
-- Migration 0040 — Senior Associate can create clients.
--
-- 0039 read "Senior Associate: Read only by default" literally and removed
-- both clients.create and clients.update. Correction: Senior Associate keeps
-- clients.create (they can onboard new clients) but stays without
-- clients.update (editing an existing client record is still leadership-
-- only, unchanged). Associate and Junior Associate are untouched — still
-- read-only for clients, per the original request.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.create'
  and r.key = 'senior_associate'
on conflict do nothing;
