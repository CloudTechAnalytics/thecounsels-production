-- ============================================================================
-- Migration 0041 — Senior Associate can edit clients and manage contacts.
--
-- Further correction to 0039/0040: Senior Associate now gets full CRU on
-- clients (create, read, update — still no delete, which stays Managing-
-- Partner-only) plus clients.manage_contacts. Associate and Junior
-- Associate remain read-only, unchanged.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key in ('clients.update', 'clients.manage_contacts')
  and r.key = 'senior_associate'
on conflict do nothing;
