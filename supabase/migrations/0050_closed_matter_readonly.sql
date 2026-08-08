-- Closed Matter Read-Only Mode.
--
-- Once a matter reaches a terminal status (closed/won/lost — the same set
-- matters.service.ts already treats as "closing" for closed_on purposes),
-- every operational write against it or its child records is blocked at the
-- RLS/trigger level, for everyone, with no leadership exception. Read access
-- (view/download everything, including the Activity Timeline) is completely
-- unaffected. The only way back is the new reopen_matter() RPC, gated by a
-- new managing_partner-only permission, which performs the narrow status
-- flip as SECURITY DEFINER — the one deliberate bypass of the freeze below.

-- 1. Helper: is this matter currently open (or does it not exist / have no
--    matter at all, in which case the caller's own null-check applies)?
create or replace function public.matter_is_open(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status not in ('closed', 'won', 'lost') from public.matters where id = p_matter), true);
$$;

-- 2. matters_update — freeze the normal edit path once a matter is closed.
--    (matters_select/_delete/_insert are untouched; reopening bypasses this
--    via reopen_matter()'s SECURITY DEFINER update, below.)
drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (
    public.has_permission(organization_id, 'matters.update')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id)
    and status not in ('closed', 'won', 'lost')
  )
  with check (
    public.has_permission(organization_id, 'matters.update')
    and public.matter_row_access(organization_id, lead_lawyer_id, created_by, id)
  );

-- 3. matter_notes — insert/update/delete gated on the matter being open.
drop policy if exists "matter_notes_insert" on public.matter_notes;
create policy "matter_notes_insert" on public.matter_notes
  for insert with check (
    public.has_permission(organization_id, 'matters.view')
    and public.has_matter_access(matter_id)
    and public.matter_is_open(matter_id)
  );

drop policy if exists "matter_notes_update" on public.matter_notes;
create policy "matter_notes_update" on public.matter_notes
  for update
  using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
    and public.matter_is_open(matter_id)
  )
  with check (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
    and public.matter_is_open(matter_id)
  );

drop policy if exists "matter_notes_delete" on public.matter_notes;
create policy "matter_notes_delete" on public.matter_notes
  for delete using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
    and public.matter_is_open(matter_id)
  );

-- 4. tasks
drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.has_permission(organization_id, 'tasks.create')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  )
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    public.has_permission(organization_id, 'tasks.delete')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

-- 5. documents (table)
drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (
    public.has_permission(organization_id, 'documents.upload')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update
  using (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  )
  with check (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    public.has_permission(organization_id, 'documents.delete')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

-- 6. hearings
drop policy if exists "hearings_insert" on public.hearings;
create policy "hearings_insert" on public.hearings
  for insert with check (
    public.has_permission(organization_id, 'hearings.create')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "hearings_update" on public.hearings;
create policy "hearings_update" on public.hearings
  for update
  using (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  )
  with check (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

drop policy if exists "hearings_delete" on public.hearings;
create policy "hearings_delete" on public.hearings
  for delete using (
    public.has_permission(organization_id, 'hearings.delete')
    and (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
  );

-- 7. time_entries — ANDed alongside the existing invoiced/paid lock.
drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert" on public.time_entries
  for insert with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update" on public.time_entries
  for update
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries
  for delete using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

-- 8. expenses — ANDed alongside the existing invoiced lock (0048).
drop policy if exists "expenses_insert" on public.expenses;
create policy "expenses_insert" on public.expenses
  for insert
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  );

drop policy if exists "expenses_update" on public.expenses;
create policy "expenses_update" on public.expenses
  for update
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete" on public.expenses
  for delete
  using (
    (matter_id is null or (public.has_matter_access(matter_id) and public.matter_is_open(matter_id)))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

-- 9. matter_assignments — reassignment is blocked too (matter_id is never
--    null here, unlike the tables above).
drop policy if exists "matter_assignments_insert" on public.matter_assignments;
create policy "matter_assignments_insert" on public.matter_assignments
  for insert with check (
    (public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign'))
    and public.matter_is_open(matter_id)
  );

drop policy if exists "matter_assignments_delete" on public.matter_assignments;
create policy "matter_assignments_delete" on public.matter_assignments
  for delete using (
    (public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign'))
    and public.matter_is_open(matter_id)
  );

-- 10. Storage — defense in depth so the restriction can't be bypassed by
--     talking to storage.objects directly. Both buckets store objects at
--     <org_id>/<matter_id-or-'general'>/<uuid>-<filename>.
drop policy if exists "documents_storage_insert" on storage.objects;
create policy "documents_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.upload')
    and ((storage.foldername(name))[2] = 'general' or public.matter_is_open(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists "documents_storage_delete" on storage.objects;
create policy "documents_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.delete')
    and ((storage.foldername(name))[2] = 'general' or public.matter_is_open(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists "receipts_storage_insert" on storage.objects;
create policy "receipts_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'billing.view')
    and ((storage.foldername(name))[2] = 'general' or public.matter_is_open(((storage.foldername(name))[2])::uuid))
  );

drop policy if exists "receipts_storage_delete" on storage.objects;
create policy "receipts_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.storage_path = name
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and (not e.invoiced or public.is_partner_or_above(e.organization_id))
        and (e.matter_id is null or public.matter_is_open(e.matter_id))
    )
  );

-- 11. matters.reopen permission — seeded to managing_partner only, same
--     shape as payments.void (0049).
insert into public.permissions (key, resource, action, description)
values ('matters.reopen', 'matters', 'reopen', 'Reopen a closed matter, restoring normal permissions')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'matters.reopen'
  and r.key = 'managing_partner'
on conflict do nothing;

-- 12. reopen_matter() — the single deliberate bypass of the freeze above.
create or replace function public.reopen_matter(p_matter uuid, p_reason text default null)
returns public.matters
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.matters;
  v_org uuid;
  v_prev_status public.matter_status;
begin
  select organization_id, status into v_org, v_prev_status from public.matters where id = p_matter for update;
  if v_org is null then
    raise exception 'Matter not found';
  end if;
  if not public.has_permission(v_org, 'matters.reopen') then
    raise exception 'Only a Managing Partner can reopen a matter';
  end if;
  if v_prev_status not in ('closed', 'won', 'lost') then
    raise exception 'Matter is not closed';
  end if;

  perform set_config('app.status_change_reason', coalesce(p_reason, ''), true);

  update public.matters
  set status = 'open', closed_on = null, updated_at = now()
  where id = p_matter
  returning * into rec;

  perform public.log_audit(
    p_org => v_org,
    p_action => 'matter.reopened',
    p_entity_type => 'matter',
    p_entity_id => p_matter,
    p_summary => 'Reopened matter ' || coalesce(rec.matter_number, '') || ' — ' || rec.title,
    p_metadata => jsonb_build_object('previous_status', v_prev_status, 'reason', p_reason)
  );

  return rec;
end;
$$;

-- 13. track_matter_status() — distinguish closing/reopening in the Activity
--     Timeline and pick up an optional reason via the transaction-local GUC
--     reopen_matter() sets. The existing close path (matters.service.ts's
--     update()) never sets that GUC, so it's unaffected beyond the new kind.
create or replace function public.track_matter_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('app.status_change_reason', true), '');
  v_kind text;
  v_summary text;
begin
  if new.status is distinct from old.status then
    v_kind := case
      when new.status in ('closed', 'won', 'lost') then 'matter_closed'
      when old.status in ('closed', 'won', 'lost') then 'matter_reopened'
      else 'status_changed'
    end;
    v_summary := 'Status changed from ' || old.status || ' to ' || new.status;
    if v_reason is not null then
      v_summary := v_summary || ' — ' || v_reason;
    end if;
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (
      new.organization_id, new.id, auth.uid(), v_kind, v_summary,
      jsonb_build_object('from', old.status, 'to', new.status, 'reason', v_reason)
    );
  end if;
  return new;
end;
$$;
