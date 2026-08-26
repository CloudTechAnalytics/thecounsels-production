-- ============================================================================
-- Migration 0131 — Let platform admins and firm members delete support
-- tickets.
--
-- support_tickets (0019) had select/insert/update, all shaped as
-- "is_platform_admin() or is_org_member(organization_id)" — DELETE never
-- got the same treatment. Matching that existing shape exactly: either
-- side that raised or is handling the ticket can remove it.
-- support_ticket_messages already cascades on ticket delete (0019's FK),
-- so no separate policy needed there.
-- ============================================================================

create policy "support_tickets_delete" on public.support_tickets
  for delete using (public.is_platform_admin() or public.is_org_member(organization_id));
