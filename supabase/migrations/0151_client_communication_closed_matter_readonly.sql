-- ============================================================================
-- Migration 0151 — Real bug caught by the user: a closed matter is
-- supposed to be fully read-only (0050's convention, applied to documents/
-- tasks/hearings/notes) — "nobody should be able to do anything again
-- unless it is reopened." client_communications' insert/update policies
-- (0145/0149) checked has_matter_access(matter_id) but never
-- matter_is_open(matter_id), so an associate could still send a brand new
-- client email off a closed matter. This was a deliberate design choice
-- at the time (see 0145's own comment — "a closing letter is legitimate
-- right after a matter closes") that the user has now overridden directly:
-- closed means closed, full stop, until reopened. That's the actual rule
-- from here on.
-- ============================================================================

drop policy if exists "client_communications_insert" on public.client_communications;
create policy "client_communications_insert" on public.client_communications
  for insert with check (
    public.has_permission(organization_id, 'clients.communicate')
    and exists (select 1 from public.clients c where c.id = client_id)
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "client_communications_update" on public.client_communications;
create policy "client_communications_update" on public.client_communications
  for update
  using (
    status <> 'SENT'
    and public.has_permission(organization_id, 'clients.communicate')
    and exists (select 1 from public.clients c where c.id = client_id)
  )
  with check (
    public.has_permission(organization_id, 'clients.communicate')
    and exists (select 1 from public.clients c where c.id = client_id)
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );
