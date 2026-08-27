-- ============================================================================
-- Migration 0149 — Fix a real bug caught live: send-client-communication
-- (0145) was missing CORS headers entirely (every other browser-invoked
-- Edge Function in this project has them — paystack-init-transaction,
-- generate-data-export, admin-create-user). The browser blocked the
-- request before any response came back, so every send failed with a bare
-- "Failed to fetch", and the row it had already inserted was stuck
-- PENDING forever — with no way to retry, edit, or delete it, since 0145
-- deliberately gave client_communications no update/delete policy at all
-- (modeled on notification_log's "permanent record" posture, which turned
-- out to be too strict: that posture only makes sense for a row that
-- actually SENT).
--
-- The CORS fix lives in the Edge Function itself (redeployed separately).
-- This migration fixes the other half: a PENDING/FAILED row (never
-- actually delivered) is not yet a permanent record and should be
-- editable/deletable/retriable. A SENT row stays exactly as immutable as
-- before — that IS a real record of what was actually emailed.
-- ============================================================================

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
    and (matter_id is null or public.has_matter_access(matter_id))
  );

create policy "client_communications_delete" on public.client_communications
  for delete using (
    status <> 'SENT'
    and public.has_permission(organization_id, 'clients.communicate')
    and exists (select 1 from public.clients c where c.id = client_id)
  );
