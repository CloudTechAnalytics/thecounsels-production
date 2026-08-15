-- ============================================================================
-- Migration 0093 — split Secretary from Receptionist; let Secretary
-- actually schedule hearings.
--
-- Both roles were seeded identically in 0003 (front-office bundle: view
-- matters/clients/documents/hearings, manage tasks) — no real distinction
-- between "supports specific lawyers/matters" (Secretary) and "front-desk,
-- client-facing" (Receptionist). Splitting them:
--
--   Secretary   — keeps everything it had, PLUS hearings.create/update
--                 (it could only ever view a hearing before; scheduling
--                 one is squarely a secretarial task, and calendar.view
--                 already lets it see the result).
--   Receptionist — narrowed to Calendar + Tasks + Clients only. Loses
--                 matters.view, documents.view, hearings.view — a
--                 front-desk role has no reason to see case files, matter
--                 detail, or hearing schedules.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('hearings.create', 'hearings.update')
where r.key = 'secretary'
on conflict do nothing;

delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key = 'receptionist'
  and p.key in ('matters.view', 'documents.view', 'hearings.view');
