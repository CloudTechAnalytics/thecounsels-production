-- ============================================================================
-- Migration 0115 — branch_id on standalone tasks/hearings/documents/
-- appointments, and the matching branch check on each table's policies.
--
-- Only the matter_id IS NULL arm of every policy below is touched. Where a
-- row IS matter-linked, its visibility already comes entirely from
-- has_matter_access(matter_id) (upgraded in 0114) — this migration does NOT
-- add a has_matter_access requirement anywhere it wasn't already present
-- (e.g. appointments_select and appointments_delete currently impose none
-- at all — that stays true; only the branch dimension is added to the
-- matter_id-is-null case, never a new matter-access restriction).
-- ============================================================================

alter table public.tasks add column branch_id uuid references public.branches(id) on delete set null;
alter table public.hearings add column branch_id uuid references public.branches(id) on delete set null;
alter table public.documents add column branch_id uuid references public.branches(id) on delete set null;
alter table public.appointments add column branch_id uuid references public.branches(id) on delete set null;

create index idx_tasks_branch on public.tasks (branch_id) where branch_id is not null;
create index idx_hearings_branch on public.hearings (branch_id) where branch_id is not null;
create index idx_documents_branch on public.documents (branch_id) where branch_id is not null;
create index idx_appointments_branch on public.appointments (branch_id) where branch_id is not null;

update public.tasks t set branch_id = hq.id from public.branches hq
  where t.matter_id is null and t.branch_id is null and hq.organization_id = t.organization_id and hq.is_head_office;
update public.hearings h set branch_id = hq.id from public.branches hq
  where h.matter_id is null and h.branch_id is null and hq.organization_id = h.organization_id and hq.is_head_office;
update public.documents d set branch_id = hq.id from public.branches hq
  where d.matter_id is null and d.branch_id is null and hq.organization_id = d.organization_id and hq.is_head_office;
update public.appointments a set branch_id = hq.id from public.branches hq
  where a.matter_id is null and a.branch_id is null and hq.organization_id = a.organization_id and hq.is_head_office;

-- ----------------------------------------------------------------------------
-- tasks — has_task_access() is the single choke point for SELECT (0109);
-- tasks_insert/update/delete are handled directly since they don't route
-- through it.
-- ----------------------------------------------------------------------------
create or replace function public.has_task_access(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task
      and (
        (
          public.has_permission(t.organization_id, 'tasks.view')
          and (t.matter_id is not null or t.branch_id is null or public.user_has_branch_access(t.organization_id, t.branch_id))
        )
        or t.assignee_id = auth.uid()
        or t.created_by = auth.uid()
      )
  );
$$;

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.has_permission(organization_id, 'tasks.create')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (
    (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  )
  with check (
    (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    public.has_permission(organization_id, 'tasks.delete')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

-- ----------------------------------------------------------------------------
-- hearings — same idiom as documents (0030 select, 0050 insert/update/delete).
-- ----------------------------------------------------------------------------
drop policy if exists "hearings_select" on public.hearings;
create policy "hearings_select" on public.hearings
  for select using (
    public.has_permission(organization_id, 'hearings.view')
    and (
      (matter_id is not null and public.has_matter_access(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "hearings_insert" on public.hearings;
create policy "hearings_insert" on public.hearings
  for insert with check (
    public.has_permission(organization_id, 'hearings.create')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "hearings_update" on public.hearings;
create policy "hearings_update" on public.hearings
  for update
  using (
    public.has_permission(organization_id, 'hearings.update')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  )
  with check (
    public.has_permission(organization_id, 'hearings.update')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "hearings_delete" on public.hearings;
create policy "hearings_delete" on public.hearings
  for delete using (
    public.has_permission(organization_id, 'hearings.delete')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

-- ----------------------------------------------------------------------------
-- documents (table) — mirrors hearings exactly.
-- ----------------------------------------------------------------------------
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    public.has_permission(organization_id, 'documents.view')
    and (
      (matter_id is not null and public.has_matter_access(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (
    public.has_permission(organization_id, 'documents.upload')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update
  using (
    public.has_permission(organization_id, 'documents.update')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  )
  with check (
    public.has_permission(organization_id, 'documents.update')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    public.has_permission(organization_id, 'documents.delete')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

-- ----------------------------------------------------------------------------
-- appointments — today's select/delete impose NO matter-access check at all
-- (confirmed in 0110). That stays true; only the branch dimension is added
-- to the matter_id-is-null case on select/insert/update. delete is left
-- fully untouched (adding a check there would be a first-time restriction
-- with no precedent in this table, out of scope for an additive migration).
-- ----------------------------------------------------------------------------
drop policy if exists "appointments_select" on public.appointments;
create policy "appointments_select" on public.appointments
  for select using (
    public.has_permission(organization_id, 'appointments.view')
    and (matter_id is not null or branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

drop policy if exists "appointments_insert" on public.appointments;
create policy "appointments_insert" on public.appointments
  for insert with check (
    public.has_permission(organization_id, 'appointments.create')
    and public.org_has_feature(organization_id, 'appointments')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

drop policy if exists "appointments_update" on public.appointments;
create policy "appointments_update" on public.appointments
  for update using (public.has_permission(organization_id, 'appointments.update'))
  with check (
    public.has_permission(organization_id, 'appointments.update')
    and (
      (matter_id is not null and public.has_matter_access(matter_id) and public.matter_is_open(matter_id))
      or (matter_id is null and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    )
  );

-- appointments_delete unchanged: for delete using (public.has_permission(organization_id, 'appointments.delete'));

-- ----------------------------------------------------------------------------
-- storage.objects — documents bucket SELECT already joins to `documents` by
-- storage_path for the matter-access check (0030). Extend that exact join
-- to also deny standalone documents whose branch the caller can't reach.
-- INSERT/DELETE deliberately left untouched — they don't check
-- has_matter_access today either (confirmed in 0050), so adding a branch
-- restriction there would be a first-time tightening with no read-access
-- justification; the confidentiality property that matters for a "direct
-- storage path" concern is a read/download concern, which SELECT covers.
-- ----------------------------------------------------------------------------
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view')
    and not exists (
      select 1 from public.documents d
      where d.storage_path = name
        and (
          (d.matter_id is not null and not public.has_matter_access(d.matter_id))
          or (d.matter_id is null and d.branch_id is not null and not public.user_has_branch_access(d.organization_id, d.branch_id))
        )
    )
  );
