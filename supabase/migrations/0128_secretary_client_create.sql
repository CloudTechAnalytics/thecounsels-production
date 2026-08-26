-- ============================================================================
-- Migration 0128 — Secretary role gains clients.create.
--
-- Secretary could already view clients and matters, and fully run the
-- calendar (appointments/hearings/tasks), but couldn't create a new client
-- record — in practice this is usually the first thing a secretary/
-- receptionist does when a new client calls or walks in, well before a
-- lawyer is involved. Deliberately NOT extending to clients.update/delete
-- (editing an existing client stays a fee-earner call) or matters.create
-- (opening a matter is a substantive/billing decision, not clerical).
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.key = 'secretary' and p.key = 'clients.create'
on conflict do nothing;
