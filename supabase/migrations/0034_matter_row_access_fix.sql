-- ============================================================================
-- Migration 0034 — Fix has_matter_access() being unusable on the matters
-- table's own policies.
--
-- has_matter_access(matter_id) works by re-querying `matters` from inside
-- itself — correct and necessary for every CHILD table (documents, tasks,
-- etc.), where matter_id points to a matter that already exists from an
-- earlier, separate transaction. But matters_select/update/delete used the
-- SAME function on the matters table itself, which is self-referential: RLS
-- checks (including the implicit SELECT-policy check on an INSERT's
-- RETURNING clause) run within the same command as any write to that row,
-- and a fresh nested SELECT re-scanning matters from that same command
-- cannot see a row that command is in the middle of inserting — Postgres
-- table scans use a stable snapshot from the start of the command, and only
-- a CTE's own output (not a fresh re-query of the underlying table) can see
-- a row written earlier in the same statement. Net effect: has_matter_access
-- always found zero matching rows for a just-created matter and returned
-- false, for every user, regardless of role or permissions — confirmed via
-- a live diagnostic showing is_org_admin/created_by both true while
-- has_matter_access still returned false for the exact same row.
--
-- Fixed by checking access directly against the row's own column values —
-- which RLS provides directly in USING/WITH CHECK with no subquery needed —
-- instead of re-fetching the row. has_matter_access() itself is unchanged
-- and remains correct for every child table's policies.
-- ============================================================================

create or replace function public.matter_row_access(
  p_org uuid,
  p_lead_lawyer uuid,
  p_created_by uuid,
  p_matter uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'matters.view')
    and (
      public.is_org_admin(p_org)
      or public.has_permission(p_org, 'matters.view_all')
      or p_lead_lawyer = auth.uid()
      or p_created_by = auth.uid()
      or exists (
        select 1 from public.matter_assignments ma
        where ma.matter_id = p_matter and ma.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.matter_row_access(uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists "matters_select" on public.matters;
create policy "matters_select" on public.matters
  for select using (public.matter_row_access(organization_id, lead_lawyer_id, created_by, id));

drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (public.has_permission(organization_id, 'matters.update') and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id))
  with check (public.has_permission(organization_id, 'matters.update') and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id));

drop policy if exists "matters_delete" on public.matters;
create policy "matters_delete" on public.matters
  for delete using (public.has_permission(organization_id, 'matters.delete') and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id));

-- Clean up the two RLS-test rows left by our diagnostic session, if present.
delete from public.matters where title = 'RLS TEST — DELETE ME';
