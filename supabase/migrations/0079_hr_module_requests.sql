-- ============================================================================
-- Migration 0079 — HR & People Management, Part 5: HR Requests.
--
-- Deliberately separate from Leave (0078) — leave has its own balance/
-- entitlement machinery; a request for an employment letter or a salary
-- certificate doesn't. Status changes go through update_hr_request_status()
-- rather than a raw policy, same audit/notification guarantee as leave.
-- ============================================================================

create table public.hr_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  request_type    text not null check (request_type in (
                     'employment_letter', 'salary_certificate', 'personal_info_change',
                     'hr_document_request', 'equipment_request', 'workplace_issue', 'other'
                   )),
  subject         text not null,
  details         text,
  status          text not null default 'submitted' check (status in (
                     'submitted', 'in_review', 'in_progress', 'approved', 'rejected', 'completed'
                   )),
  handled_by      uuid references public.profiles(id) on delete set null,
  handled_at      timestamptz,
  resolution_note text,
  created_at      timestamptz not null default now()
);
create index idx_hr_requests_org_status on public.hr_requests (organization_id, status, created_at desc);

alter table public.hr_requests enable row level security;
create policy "hr_requests_select" on public.hr_requests
  for select using (user_id = auth.uid() or public.has_permission(organization_id, 'hr_requests.manage'));
create policy "hr_requests_insert" on public.hr_requests
  for insert with check (
    user_id = auth.uid() and status = 'submitted'
    and public.has_permission(organization_id, 'hr_requests.submit')
  );
-- No update/delete policy — update_hr_request_status() is the only transition path.

create or replace function public.update_hr_request_status(
  p_request uuid,
  p_status text,
  p_note text default null
)
returns public.hr_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.hr_requests;
begin
  if p_status not in ('in_review', 'in_progress', 'approved', 'rejected', 'completed') then
    raise exception 'Invalid status: %', p_status;
  end if;

  select * into rec from public.hr_requests where id = p_request;
  if rec.id is null then
    raise exception 'HR request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'hr_requests.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;

  update public.hr_requests
  set status = p_status, handled_by = auth.uid(), handled_at = now(), resolution_note = coalesce(p_note, resolution_note)
  where id = p_request
  returning * into rec;

  perform public.log_audit(rec.organization_id, 'hr_request.updated', 'hr_request', rec.id,
    format('HR request marked %s', p_status), jsonb_build_object('note', p_note));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'hr_request.updated',
    'hr_request', rec.id, format('Your request "%s" is now %s', rec.subject, replace(p_status, '_', ' ')), 'info');

  return rec;
end;
$$;

grant execute on function public.update_hr_request_status(uuid, text, text) to authenticated;
