-- ============================================================================
-- Migration 0157 — client_communications_select relied entirely on Postgres
-- enforcing RLS transitively inside a correlated EXISTS subquery against
-- clients, rather than checking has_permission(organization_id, ...)
-- directly the way every other policy on this table (insert/update/delete)
-- and almost every other table in this schema does. Verified safe today —
-- clients_select is itself correctly gated by has_permission(organization_id,
-- 'clients.view'), and Postgres guarantees RLS is enforced on every table
-- access for non-bypassrls roles, including nested subqueries — but the
-- protection was invisible at the point of read: a future change to
-- clients_select, or a new SECURITY DEFINER helper introduced to "simplify"
-- this exact subquery, would silently reopen cross-tenant access here with
-- no signal at this table's own policy. Making the check direct and
-- explicit, matching insert/update/delete on this same table.
-- ============================================================================

drop policy if exists client_communications_select on public.client_communications;

create policy client_communications_select on public.client_communications
for select
using (
  has_permission(organization_id, 'clients.view')
  and exists (select 1 from public.clients c where c.id = client_communications.client_id)
);
