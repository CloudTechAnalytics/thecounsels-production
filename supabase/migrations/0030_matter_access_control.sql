-- ============================================================================
-- Migration 0030 — P1 security fix: matter-level access control.
--
-- Every policy on matters and its child tables (documents, matter_notes,
-- matter_events, hearings, tasks, time_entries, expenses, invoices,
-- invoice_items, payments) previously gated only on an org-wide permission
-- (`has_permission(org, 'matters.view')` etc.) — anyone holding that
-- permission saw and could edit EVERY matter in the firm, forever, whether
-- or not they were ever assigned to it, and removing them from a matter did
-- nothing. This migration adds real row-level authorization: a matter is
-- visible/editable only to its lead lawyer, explicitly assigned lawyers,
-- org admins/owners, or `matters.view_all` holders — enforced entirely in
-- RLS, not the frontend, so every surface (list, dashboard, search,
-- calendar, reports) narrows automatically with no application code change.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New permission: matters.view_all — "see every matter, not just mine."
--    managing_partner/partner already get every permission via the existing
--    leadership cross-join grant; finance needs it explicitly for firm-wide
--    billing visibility. Platform roles are covered separately below.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description) values
  ('matters.view_all', 'matters', 'view_all', 'View every matter in the firm, not just assigned ones')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'matters.view_all'
  and r.key in ('platform_owner', 'platform_admin', 'managing_partner', 'partner', 'finance')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 2. matter_assignments — additive to lead_lawyer_id, not a replacement.
--    A matter's authorized fee-earners are its lead lawyer PLUS everyone
--    with a row here.
-- ----------------------------------------------------------------------------
create table public.matter_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  matter_id       uuid not null references public.matters(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (matter_id, user_id)
);

create index idx_matter_assignments_matter on public.matter_assignments (matter_id);
create index idx_matter_assignments_user on public.matter_assignments (user_id);

-- ----------------------------------------------------------------------------
-- 3. has_matter_access — single source of truth, composes the existing
--    has_permission/is_org_admin helpers (which already cover
--    is_platform_admin() internally) with lead_lawyer_id and assignments.
-- ----------------------------------------------------------------------------
create or replace function public.has_matter_access(p_matter uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matters m
    where m.id = p_matter
      and public.has_permission(m.organization_id, 'matters.view')
      and (
        public.is_org_admin(m.organization_id)
        or public.has_permission(m.organization_id, 'matters.view_all')
        or m.lead_lawyer_id = auth.uid()
        or exists (
          select 1 from public.matter_assignments ma
          where ma.matter_id = m.id and ma.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.has_matter_access(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Safety net #1 — whoever opens a matter always keeps access to it, even
--    if they don't set themselves as lead lawyer.
-- ----------------------------------------------------------------------------
create or replace function public.grant_matter_creator_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.matter_assignments (organization_id, matter_id, user_id, assigned_by)
    values (new.organization_id, new.id, new.created_by, new.created_by)
    on conflict (matter_id, user_id) do nothing;
  end if;
  return new;
end $$;

create trigger trg_grant_matter_creator_access
  after insert on public.matters
  for each row execute function public.grant_matter_creator_access();

-- ----------------------------------------------------------------------------
-- 5. Safety net #2 — backfill existing matters with no lead lawyer (the same
--    condition that caused the Reports "Active Matters shows 0" bug) so this
--    migration doesn't retroactively lock their creator out.
-- ----------------------------------------------------------------------------
insert into public.matter_assignments (organization_id, matter_id, user_id, assigned_by)
select m.organization_id, m.id, m.created_by, m.created_by
from public.matters m
where m.lead_lawyer_id is null and m.created_by is not null
on conflict (matter_id, user_id) do nothing;

-- ----------------------------------------------------------------------------
-- 6. matter_assignments RLS.
-- ----------------------------------------------------------------------------
alter table public.matter_assignments enable row level security;

create policy "matter_assignments_select" on public.matter_assignments
  for select using (public.has_matter_access(matter_id));

create policy "matter_assignments_insert" on public.matter_assignments
  for insert with check (
    public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign')
  );

create policy "matter_assignments_delete" on public.matter_assignments
  for delete using (
    public.is_org_admin(organization_id) or public.has_permission(organization_id, 'matters.assign')
  );

-- ----------------------------------------------------------------------------
-- 7. Tighten RLS — matters.
-- ----------------------------------------------------------------------------
drop policy if exists "matters_select" on public.matters;
create policy "matters_select" on public.matters
  for select using (public.has_matter_access(id));

drop policy if exists "matters_update" on public.matters;
create policy "matters_update" on public.matters
  for update
  using (public.has_permission(organization_id, 'matters.update') and public.has_matter_access(id))
  with check (public.has_permission(organization_id, 'matters.update') and public.has_matter_access(id));

drop policy if exists "matters_delete" on public.matters;
create policy "matters_delete" on public.matters
  for delete using (public.has_permission(organization_id, 'matters.delete') and public.has_matter_access(id));
-- matters_insert is unchanged — a new row has no id to check access against yet.

-- ----------------------------------------------------------------------------
-- 8. matter_notes.
-- ----------------------------------------------------------------------------
drop policy if exists "matter_notes_select" on public.matter_notes;
create policy "matter_notes_select" on public.matter_notes
  for select using (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_notes_insert" on public.matter_notes;
create policy "matter_notes_insert" on public.matter_notes
  for insert with check (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_notes_delete" on public.matter_notes;
create policy "matter_notes_delete" on public.matter_notes
  for delete using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or author_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 9. documents (matter_id is nullable — a "general" document stays reachable
--    by anyone who could see it today; only matter-linked ones get scoped).
-- ----------------------------------------------------------------------------
drop policy if exists "documents_select" on public.documents;
create policy "documents_select" on public.documents
  for select using (
    public.has_permission(organization_id, 'documents.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "documents_insert" on public.documents;
create policy "documents_insert" on public.documents
  for insert with check (
    public.has_permission(organization_id, 'documents.upload')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "documents_update" on public.documents;
create policy "documents_update" on public.documents
  for update
  using (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_permission(organization_id, 'documents.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "documents_delete" on public.documents;
create policy "documents_delete" on public.documents
  for delete using (
    public.has_permission(organization_id, 'documents.delete')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- Storage objects mirror the documents table's matter scoping via a join —
-- the folder-based org check stays as the first line of defense, this adds
-- the matter-level check for objects that belong to a matter-linked document.
drop policy if exists "documents_storage_select" on storage.objects;
create policy "documents_storage_select" on storage.objects
  for select using (
    bucket_id = 'documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view')
    and not exists (
      select 1 from public.documents d
      where d.storage_path = name
        and d.matter_id is not null
        and not public.has_matter_access(d.matter_id)
    )
  );

-- ----------------------------------------------------------------------------
-- 10. matter_events (the timeline — always matter-linked, never nullable).
-- ----------------------------------------------------------------------------
drop policy if exists "matter_events_select" on public.matter_events;
create policy "matter_events_select" on public.matter_events
  for select using (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_events_insert" on public.matter_events;
create policy "matter_events_insert" on public.matter_events
  for insert with check (public.has_permission(organization_id, 'matters.view') and public.has_matter_access(matter_id));

drop policy if exists "matter_events_delete" on public.matter_events;
create policy "matter_events_delete" on public.matter_events
  for delete using (
    public.has_matter_access(matter_id)
    and (public.has_permission(organization_id, 'matters.update') or actor_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 11. hearings (matter_id nullable — firm-wide hearings stay unrestricted).
-- ----------------------------------------------------------------------------
drop policy if exists "hearings_select" on public.hearings;
create policy "hearings_select" on public.hearings
  for select using (
    public.has_permission(organization_id, 'hearings.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "hearings_insert" on public.hearings;
create policy "hearings_insert" on public.hearings
  for insert with check (
    public.has_permission(organization_id, 'hearings.create')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "hearings_update" on public.hearings;
create policy "hearings_update" on public.hearings
  for update
  using (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_permission(organization_id, 'hearings.update')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "hearings_delete" on public.hearings;
create policy "hearings_delete" on public.hearings
  for delete using (
    public.has_permission(organization_id, 'hearings.delete')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- 12. tasks (matter_id nullable; self-assignment no longer bypasses scoping).
-- ----------------------------------------------------------------------------
drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select using (
    public.has_permission(organization_id, 'tasks.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert with check (
    public.has_permission(organization_id, 'tasks.create')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'tasks.update') or assignee_id = auth.uid())
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete using (
    public.has_permission(organization_id, 'tasks.delete')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- 13. time_entries (matter_id nullable; supersedes 0016's select policy and
--     0024's insert/update/delete split — same shape, matter scoping added).
-- ----------------------------------------------------------------------------
drop policy if exists "time_entries_select" on public.time_entries;
create policy "time_entries_select" on public.time_entries
  for select using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "time_entries_insert" on public.time_entries;
create policy "time_entries_insert" on public.time_entries
  for insert with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "time_entries_update" on public.time_entries;
create policy "time_entries_update" on public.time_entries
  for update
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

drop policy if exists "time_entries_delete" on public.time_entries;
create policy "time_entries_delete" on public.time_entries
  for delete using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
    and (status not in ('invoiced', 'paid') or public.is_partner_or_above(organization_id))
  );

-- ----------------------------------------------------------------------------
-- 14. expenses (matter_id nullable).
-- ----------------------------------------------------------------------------
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select" on public.expenses
  for select using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'billing.view') or user_id = auth.uid())
  );

drop policy if exists "expenses_write" on public.expenses;
create policy "expenses_write" on public.expenses
  for all
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 15. invoices (matter_id nullable — a client-level invoice with no matter
--     stays reachable by any billing.view holder, matching Reports' existing
--     documented boundary for matter-less invoices).
-- ----------------------------------------------------------------------------
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (
    public.has_permission(organization_id, 'billing.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices
  for all
  using (
    public.has_permission(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_permission(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

-- ----------------------------------------------------------------------------
-- 16. invoice_items / payments — no matter_id of their own; join through
--     invoices.matter_id.
-- ----------------------------------------------------------------------------
drop policy if exists "invoice_items_select" on public.invoice_items;
create policy "invoice_items_select" on public.invoice_items
  for select using (
    public.has_permission(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "invoice_items_write" on public.invoice_items;
create policy "invoice_items_write" on public.invoice_items
  for all
  using (
    public.has_permission(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_permission(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    public.has_permission(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments
  for all
  using (
    public.has_permission(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_permission(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 17. Audit trail — mirrors the existing track_matter_status pattern
--     (0012_matter_tracking.sql).
-- ----------------------------------------------------------------------------
create or replace function public.track_matter_lead_lawyer_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  old_name text;
  new_name text;
begin
  if new.lead_lawyer_id is distinct from old.lead_lawyer_id then
    select full_name into new_name from public.profiles where id = new.lead_lawyer_id;
    if old.lead_lawyer_id is null then
      insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
      values (new.organization_id, new.id, auth.uid(), 'lead_lawyer_assigned',
        'Assigned ' || coalesce(new_name, 'someone') || ' as lead lawyer',
        jsonb_build_object('from', old.lead_lawyer_id, 'to', new.lead_lawyer_id));
    else
      select full_name into old_name from public.profiles where id = old.lead_lawyer_id;
      insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
      values (new.organization_id, new.id, auth.uid(), 'lead_lawyer_changed',
        'Lead Lawyer changed from ' || coalesce(old_name, '—') || ' to ' || coalesce(new_name, 'nobody'),
        jsonb_build_object('from', old.lead_lawyer_id, 'to', new.lead_lawyer_id));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_track_matter_lead_lawyer_changed on public.matters;
create trigger trg_track_matter_lead_lawyer_changed
  after update of lead_lawyer_id on public.matters
  for each row execute function public.track_matter_lead_lawyer_changed();

create or replace function public.track_matter_assignment_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  user_name text;
  m_number text;
begin
  select full_name into actor_name from public.profiles where id = coalesce(new.assigned_by, auth.uid());
  select full_name into user_name from public.profiles where id = new.user_id;
  select matter_number into m_number from public.matters where id = new.matter_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, coalesce(new.assigned_by, auth.uid()), 'lawyer_assigned',
    coalesce(actor_name, 'Someone') || ' assigned ' || coalesce(user_name, 'a team member')
      || ' to Matter ' || coalesce(m_number, ''),
    jsonb_build_object('user_id', new.user_id));
  return new;
end $$;

drop trigger if exists trg_track_matter_assignment_added on public.matter_assignments;
create trigger trg_track_matter_assignment_added
  after insert on public.matter_assignments
  for each row execute function public.track_matter_assignment_added();

create or replace function public.track_matter_assignment_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  user_name text;
  m_number text;
begin
  select full_name into actor_name from public.profiles where id = auth.uid();
  select full_name into user_name from public.profiles where id = old.user_id;
  select matter_number into m_number from public.matters where id = old.matter_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'lawyer_removed',
    coalesce(actor_name, 'Someone') || ' removed ' || coalesce(user_name, 'a team member')
      || ' from Matter ' || coalesce(m_number, ''),
    jsonb_build_object('user_id', old.user_id));
  return old;
end $$;

drop trigger if exists trg_track_matter_assignment_removed on public.matter_assignments;
create trigger trg_track_matter_assignment_removed
  after delete on public.matter_assignments
  for each row execute function public.track_matter_assignment_removed();

-- ----------------------------------------------------------------------------
-- 18. Notify newly-assigned team members (lead-lawyer notification already
--     exists in 0025_notifications.sql and needs no change — it looks up
--     lead_lawyer_id fresh at each event, so a removed lead simply stops
--     being notified with no code change).
-- ----------------------------------------------------------------------------
create or replace function public.notify_matter_team_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  matter_title text;
  actor uuid := coalesce(new.assigned_by, auth.uid());
begin
  if actor is not null and new.user_id = actor then return new; end if;
  select full_name into actor_name from public.profiles where id = actor;
  select title into matter_title from public.matters where id = new.matter_id;
  perform public.notify_user(new.organization_id, new.user_id, actor, 'matters', 'matter.assigned',
    'matter', new.matter_id, coalesce(actor_name, 'Someone') || ' assigned you to ' || coalesce(matter_title, 'a matter'), 'info');
  return new;
end $$;

drop trigger if exists trg_notify_matter_team_assigned on public.matter_assignments;
create trigger trg_notify_matter_team_assigned
  after insert on public.matter_assignments
  for each row execute function public.notify_matter_team_assigned();
