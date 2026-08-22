-- ============================================================================
-- Migration 0118 — clients.branch_id.
--
-- The original branch-architecture plan deliberately kept clients org-wide
-- (a client like "MTN" can interact with multiple branches via different
-- matters, so a client shouldn't be duplicated per branch). In practice
-- that meant a branch-scoped user could see EVERY client in the org on the
-- Clients list/dashboard, including ones with zero connection to their own
-- branch — reported directly: a Lagos-only user saw a client that had
-- never been created in, or worked on from, Lagos at all.
--
-- Fix: clients gain a real (nullable) branch_id — the branch the client
-- was created under, exactly like matters.branch_id is a matter's primary
-- branch. Client IDENTITY still isn't duplicated — a client keeps exactly
-- one row regardless of how many branches end up working with it. What
-- changes is VISIBILITY: a branch-scoped user sees a client if EITHER
-- (a) the client's own branch_id matches one of their branches, OR
-- (b) they can already see at least one matter linked to that client
--     (has_matter_access — which itself already understands cross-branch
--     matter_branch_shares, so a client shared into their branch via a
--     matter is visible too, with no separate "client shares" table
--     needed).
-- This is the same OR-bypass-not-AND-restriction composition used
-- throughout the branch architecture — 'organization'-scope members are
-- completely unaffected (user_has_branch_access always true for them).
-- ============================================================================

alter table public.clients
  add column branch_id uuid references public.branches(id) on delete set null;

create index idx_clients_branch on public.clients (branch_id) where branch_id is not null;

update public.clients c
set branch_id = hq.id
from public.branches hq
where c.branch_id is null
  and hq.organization_id = c.organization_id
  and hq.is_head_office;

drop policy if exists "clients_select" on public.clients;
create policy "clients_select" on public.clients
  for select using (
    public.has_permission(organization_id, 'clients.view')
    and (
      branch_id is null
      or public.user_has_branch_access(organization_id, branch_id)
      or exists (
        select 1 from public.matters m
        where m.client_id = clients.id and public.has_matter_access(m.id)
      )
    )
  );

drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients
  for insert with check (
    public.has_permission(organization_id, 'clients.create')
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

drop policy if exists "clients_update" on public.clients;
create policy "clients_update" on public.clients
  for update
  using (
    public.has_permission(organization_id, 'clients.update')
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  )
  with check (
    public.has_permission(organization_id, 'clients.update')
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

drop policy if exists "clients_delete" on public.clients;
create policy "clients_delete" on public.clients
  for delete using (
    public.has_permission(organization_id, 'clients.delete')
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );
