-- ============================================================================
-- Migration 0150 — Confirmed with the user: a client communication should
-- be deletable regardless of status, not just PENDING/FAILED (0149).
-- Widens client_communications_delete only — client_communications_update
-- (edit-and-resend / retry) stays restricted to status <> 'SENT', since
-- "editing" or "retrying" a message that was actually delivered doesn't
-- correspond to anything real: there's nothing left to resend, and
-- rewriting its content afterward would misrepresent what was actually
-- emailed. Deleting it outright is a different, simpler operation this
-- migration now allows for any status.
-- ============================================================================

drop policy if exists "client_communications_delete" on public.client_communications;
create policy "client_communications_delete" on public.client_communications
  for delete using (
    public.has_permission(organization_id, 'clients.communicate')
    and exists (select 1 from public.clients c where c.id = client_id)
  );
