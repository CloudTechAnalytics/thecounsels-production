-- ============================================================================
-- Migration 0039 — Separate client permissions from matter permissions;
-- tighten client editing to leadership by default.
--
-- Client visibility was already firm-wide before this migration —
-- clients_select (0010) has always been a plain org-wide has_permission
-- check, never matter-scoped; only matters and its child tables were
-- touched by 0030's matter-level access-control work. That part of the
-- request was already true; this migration is entirely about WHO can
-- create/edit/delete client records, plus decoupling contact management
-- into its own permission. Matter permissions are not touched at all.
-- ============================================================================

-- 1. New permission: managing contacts is now separate from editing the
--    client record itself, so it can be granted independently later
--    without touching application code.
insert into public.permissions (key, resource, action, description) values
  ('clients.manage_contacts', 'clients', 'manage_contacts', 'Add, edit, remove and set the primary client contact')
on conflict (key) do nothing;

-- Seeded explicitly (the leadership cross-join in 0003 only ran once, at
-- that migration's original execution — new permissions added afterward
-- need their own grant, same as matters.view_all (0030) and
-- clients.create_duplicate (0038) did).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'clients.manage_contacts'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner')
on conflict do nothing;

-- 2. Fee-earners (senior/associate/junior associate) become read-only for
--    clients — creating and editing client records is now leadership-only.
--    They keep clients.view (unchanged) and everything matter-related
--    (unchanged) — this is scoped to clients.create/clients.update only.
delete from public.role_permissions
where role_id in (select id from public.roles where key in ('senior_associate', 'associate', 'junior_associate'))
  and permission_id in (select id from public.permissions where key in ('clients.create', 'clients.update'));

-- 3. Partner keeps Create/Read/Update but not Delete — only Managing
--    Partner can delete a client. Partner still gets every other
--    permission via the leadership cross-join (0003); this is a single
--    targeted revoke, not a re-scope of the whole role.
delete from public.role_permissions
where role_id in (select id from public.roles where key = 'partner')
  and permission_id in (select id from public.permissions where key = 'clients.delete');

-- 4. client_contacts write access now keyed on clients.manage_contacts
--    instead of clients.update/clients.create — contact management is its
--    own permission (though both default to the same roles today). Viewing
--    stays on clients.view (0038, unchanged) — "if you can view the
--    client, you can view its contacts," independent of matter access.
drop policy if exists "client_contacts_insert" on public.client_contacts;
create policy "client_contacts_insert" on public.client_contacts
  for insert with check (public.has_permission(organization_id, 'clients.manage_contacts'));

drop policy if exists "client_contacts_update" on public.client_contacts;
create policy "client_contacts_update" on public.client_contacts
  for update using (public.has_permission(organization_id, 'clients.manage_contacts'))
  with check (public.has_permission(organization_id, 'clients.manage_contacts'));

drop policy if exists "client_contacts_delete" on public.client_contacts;
create policy "client_contacts_delete" on public.client_contacts
  for delete using (public.has_permission(organization_id, 'clients.manage_contacts'));
