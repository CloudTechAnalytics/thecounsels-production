-- ============================================================================
-- Migration 0194 — Announcements become Circulars.
--
-- hr_announcements gains a reference number (CIR-2026-0001), category,
-- "must acknowledge" with an optional due date, pinning, an attachment and a
-- real branch audience. Who it was sent to is frozen at send time in
-- hr_announcement_recipients, with each person's read / acknowledged time —
-- so management can see who hasn't read it and remind them.
--
-- Privacy fix: staff previously saw every announcement, including ones sent
-- only to another department. Now they see only circulars addressed to
-- them; managers of circulars see all.
-- ============================================================================

alter table public.hr_announcements
  add column if not exists reference_no text,
  add column if not exists category text,
  add column if not exists requires_ack boolean not null default false,
  add column if not exists ack_due date,
  add column if not exists pinned boolean not null default false,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists audience_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists recipient_count integer not null default 0,
  add column if not exists updated_at timestamptz;

create table if not exists public.hr_announcement_recipients (
  announcement_id    uuid not null references public.hr_announcements(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  user_id            uuid not null references public.profiles(id) on delete cascade,
  read_at            timestamptz,
  acknowledged_at    timestamptz,
  ack_with_signature boolean not null default false,
  reminded_at        timestamptz,
  primary key (announcement_id, user_id)
);
create index if not exists idx_announcement_recipients_user on public.hr_announcement_recipients (user_id, organization_id);
alter table public.hr_announcement_recipients enable row level security;

-- Earlier announcements were visible to everyone: keep them visible, already read.
insert into public.hr_announcement_recipients (announcement_id, organization_id, user_id, read_at)
select a.id, a.organization_id, m.user_id, now()
from public.hr_announcements a
join public.memberships m on m.organization_id = a.organization_id and m.status = 'active'
on conflict do nothing;
update public.hr_announcements a set recipient_count = (select count(*) from public.hr_announcement_recipients r where r.announcement_id = a.id);

-- Reference numbers: CIR-<year>-<0001>, per firm.
create or replace function public.assign_circular_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(coalesce(new.created_at, now()), 'YYYY');
  v_n integer;
begin
  if new.reference_no is null then
    select count(*) + 1 into v_n from public.hr_announcements
    where organization_id = new.organization_id and reference_no like 'CIR-' || v_year || '-%';
    new.reference_no := 'CIR-' || v_year || '-' || lpad(v_n::text, 4, '0');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_circular_reference on public.hr_announcements;
create trigger trg_circular_reference before insert on public.hr_announcements
  for each row execute function public.assign_circular_reference();
update public.hr_announcements a set reference_no = 'CIR-' || to_char(a.created_at, 'YYYY') || '-' || lpad(x.rn::text, 4, '0')
from (select id, row_number() over (partition by organization_id, to_char(created_at, 'YYYY') order by created_at) rn from public.hr_announcements) x
where x.id = a.id and a.reference_no is null;

-- Who may see a circular: the people it was sent to, and those who manage circulars.
create or replace function public.can_view_circular(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hr_announcements a
    where a.id = p_id
      and (public.has_permission(a.organization_id, 'hr_announcements.manage')
           or exists (select 1 from public.hr_announcement_recipients r where r.announcement_id = a.id and r.user_id = auth.uid()))
  );
$$;
revoke execute on function public.can_view_circular(uuid) from public, anon;
grant execute on function public.can_view_circular(uuid) to authenticated;

drop policy if exists "hr_announcements_select" on public.hr_announcements;
create policy "hr_announcements_select" on public.hr_announcements
  for select using (public.can_view_circular(id));

drop policy if exists announcement_recipients_select on public.hr_announcement_recipients;
create policy announcement_recipients_select on public.hr_announcement_recipients
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'hr_announcements.manage'));

-- Attachments (private): org/<random>/<file>.
insert into storage.buckets (id, name, public) values ('circulars', 'circulars', false) on conflict (id) do nothing;
drop policy if exists "circulars_files_select" on storage.objects;
create policy "circulars_files_select" on storage.objects
  for select using (
    bucket_id = 'circulars'
    and exists (select 1 from public.hr_announcements a where a.attachment_path = storage.objects.name and public.can_view_circular(a.id))
  );
drop policy if exists "circulars_files_insert" on storage.objects;
create policy "circulars_files_insert" on storage.objects
  for insert with check (bucket_id = 'circulars' and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_announcements.manage'));
drop policy if exists "circulars_files_delete" on storage.objects;
create policy "circulars_files_delete" on storage.objects
  for delete using (bucket_id = 'circulars' and public.has_permission(((storage.foldername(name))[1])::uuid, 'hr_announcements.manage'));

-- Publish a circular: freeze the recipients, notify them.
create or replace function public.send_circular(
  p_org uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_department_id uuid default null,
  p_user_ids uuid[] default null,
  p_branch_id uuid default null,
  p_role_key public.role_key default null,
  p_requires_ack boolean default false,
  p_ack_due date default null,
  p_pinned boolean default false,
  p_category text default null,
  p_attachment_path text default null,
  p_attachment_name text default null
)
returns public.hr_announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_announcements;
  v_n integer;
begin
  if not public.has_permission(p_org, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'Add a title and the message';
  end if;
  if p_audience_type not in ('organization', 'department', 'employees', 'branch', 'role') then
    raise exception 'Invalid audience: %', p_audience_type;
  end if;
  if p_attachment_path is not null and split_part(p_attachment_path, '/', 1) <> p_org::text then
    raise exception 'Attachment does not belong to this firm';
  end if;

  insert into public.hr_announcements (organization_id, title, body, audience_type, audience_department_id, audience_user_ids,
    audience_branch_id, audience_role_key, requires_ack, ack_due, pinned, category, attachment_path, attachment_name, created_by)
  values (p_org, trim(p_title), p_body, p_audience_type, p_department_id, coalesce(p_user_ids, '{}'),
    p_branch_id, p_role_key, coalesce(p_requires_ack, false), p_ack_due, coalesce(p_pinned, false), nullif(trim(coalesce(p_category, '')), ''),
    p_attachment_path, p_attachment_name, auth.uid())
  returning * into rec;

  insert into public.hr_announcement_recipients (announcement_id, organization_id, user_id)
  select rec.id, p_org, m.user_id
  from public.memberships m
  join public.roles ro on ro.id = m.role_id
  where m.organization_id = p_org and m.status = 'active' and m.user_id <> auth.uid()
    and (
      p_audience_type = 'organization'
      or (p_audience_type = 'employees' and m.user_id = any(coalesce(p_user_ids, '{}')))
      or (p_audience_type = 'role' and ro.key = p_role_key)
      or (p_audience_type = 'department' and (
            exists (select 1 from public.employees e where e.organization_id = p_org and e.user_id = m.user_id and e.department_id = p_department_id)
         or exists (select 1 from public.staff_profiles sp where sp.organization_id = p_org and sp.user_id = m.user_id and sp.department_id = p_department_id)))
      or (p_audience_type = 'branch' and (
            exists (select 1 from public.member_branches mb where mb.membership_id = m.id and mb.branch_id = p_branch_id)
         or exists (select 1 from public.employees e where e.organization_id = p_org and e.user_id = m.user_id and e.branch_id = p_branch_id)))
    )
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Nobody matches that audience — choose who should receive it';
  end if;
  update public.hr_announcements set recipient_count = v_n where id = rec.id returning * into rec;

  perform public.notify_user(p_org, r.user_id, auth.uid(), 'hr', 'hr.announcement', 'hr_announcement', rec.id,
    case when rec.requires_ack then 'Please read and acknowledge: ' else 'New circular: ' end || rec.title, 'info')
  from public.hr_announcement_recipients r where r.announcement_id = rec.id;

  perform public.log_audit(p_org, 'hr.circular_sent', 'hr_announcement', rec.id,
    format('Circular %s sent to %s people: %s', rec.reference_no, v_n, rec.title),
    jsonb_build_object('audience_type', p_audience_type, 'requires_ack', rec.requires_ack));
  return rec;
end;
$$;
grant execute on function public.send_circular(uuid, text, text, text, uuid, uuid[], uuid, public.role_key, boolean, date, boolean, text, text, text) to authenticated;

-- The reader opens it.
create or replace function public.mark_circular_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.hr_announcement_recipients set read_at = coalesce(read_at, now())
  where announcement_id = p_id and user_id = auth.uid();
  update public.notifications set is_read = true
  where user_id = auth.uid() and entity_type = 'hr_announcement' and entity_id = p_id and not is_read;
end;
$$;
grant execute on function public.mark_circular_read(uuid) to authenticated;

-- The reader confirms "I have read and understood" (optionally signing).
create or replace function public.acknowledge_circular(p_id uuid, p_with_signature boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.hr_announcements;
begin
  select * into a from public.hr_announcements where id = p_id;
  if not exists (select 1 from public.hr_announcement_recipients where announcement_id = p_id and user_id = auth.uid()) then
    raise exception 'This circular was not sent to you';
  end if;
  if p_with_signature and not exists (select 1 from public.user_signatures where user_id = auth.uid()) then
    raise exception 'Add your signature in Settings first';
  end if;
  update public.hr_announcement_recipients
  set read_at = coalesce(read_at, now()), acknowledged_at = coalesce(acknowledged_at, now()),
      ack_with_signature = ack_with_signature or coalesce(p_with_signature, false)
  where announcement_id = p_id and user_id = auth.uid();
  update public.notifications set is_read = true
  where user_id = auth.uid() and entity_type = 'hr_announcement' and entity_id = p_id and not is_read;
  perform public.log_audit(a.organization_id, 'hr.circular_acknowledged', 'hr_announcement', p_id,
    'Acknowledged circular ' || coalesce(a.reference_no, '') || case when p_with_signature then ' (signed)' else '' end, '{}'::jsonb);
end;
$$;
grant execute on function public.acknowledge_circular(uuid, boolean) to authenticated;

-- Remind everyone who hasn't acknowledged (or, if no acknowledgement is needed, hasn't read it).
create or replace function public.remind_circular(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.hr_announcements;
  v_n integer;
begin
  select * into a from public.hr_announcements where id = p_id;
  if a.id is null or not public.has_permission(a.organization_id, 'hr_announcements.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  perform public.notify_user(a.organization_id, r.user_id, auth.uid(), 'hr', 'hr.announcement', 'hr_announcement', a.id,
    'Reminder: please ' || case when a.requires_ack then 'read and acknowledge ' else 'read ' end || a.title, 'warning')
  from public.hr_announcement_recipients r
  where r.announcement_id = a.id and (case when a.requires_ack then r.acknowledged_at is null else r.read_at is null end);
  get diagnostics v_n = row_count;
  update public.hr_announcement_recipients r set reminded_at = now()
  where r.announcement_id = a.id and (case when a.requires_ack then r.acknowledged_at is null else r.read_at is null end);
  return v_n;
end;
$$;
grant execute on function public.remind_circular(uuid) to authenticated;
