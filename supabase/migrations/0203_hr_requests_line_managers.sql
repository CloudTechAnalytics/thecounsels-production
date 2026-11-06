-- ============================================================================
-- Migration 0203 — HR requests through line managers; Early Access retired.
--
-- HR requests: a staff member's line manager(s) are told when they raise
-- one and can record whether they SUPPORT it, with a note. HR sees that
-- recommendation while handling the request. It is advisory — HR is never
-- blocked waiting for it. 'workplace_issue' requests are never shown to the
-- line manager (the issue may be about them) and stay confidential to HR.
-- HR handlers are now also notified when a request comes in (they weren't).
--
-- Early Access: no longer offered. Deactivated (hidden from sign-up and
-- pricing); no firm is on it.
-- ============================================================================

update public.plans set is_active = false where key = 'early_access';

alter table public.hr_requests
  add column if not exists manager_user_id uuid references auth.users(id) on delete set null,
  add column if not exists manager_support boolean,
  add column if not exists manager_note text,
  add column if not exists manager_at timestamptz;

drop policy if exists hr_requests_select on public.hr_requests;
create policy hr_requests_select on public.hr_requests
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'hr_requests.manage') and public.user_has_branch_access(organization_id, public.employee_branch(organization_id, user_id)))
    or (request_type <> 'workplace_issue' and public.is_line_manager_of(organization_id, user_id, auth.uid()))
  );

-- New request: tell HR, and (unless confidential) the line managers.
create or replace function public.hr_request_notify_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_who text := coalesce((select full_name from public.profiles where id = new.user_id), 'A staff member');
begin
  perform public.notify_user(new.organization_id, m.user_id, new.user_id, 'hr'::public.notification_category, 'hr_request.submitted', 'hr_request', new.id,
    v_who || ' raised an HR request: ' || new.subject, 'info'::public.notification_priority)
  from public.memberships m
  where m.organization_id = new.organization_id and m.status = 'active' and m.user_id <> new.user_id
    and public.approval_allows(new.organization_id, 'hr_request', m.user_id, public.employee_branch(new.organization_id, new.user_id), new.user_id);
  if new.request_type <> 'workplace_issue' then
    perform public.notify_user(new.organization_id, lm.u, new.user_id, 'hr'::public.notification_category, 'hr_request.team', 'hr_request', new.id,
      v_who || ' raised an HR request (' || new.subject || ') — add your recommendation for HR', 'info'::public.notification_priority)
    from public.line_manager_users(new.organization_id, new.user_id) lm(u)
    where not public.approval_allows(new.organization_id, 'hr_request', lm.u, public.employee_branch(new.organization_id, new.user_id), new.user_id);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_hr_request_notify_new on public.hr_requests;
create trigger trg_hr_request_notify_new after insert on public.hr_requests
  for each row execute function public.hr_request_notify_new();

-- The line manager's recommendation.
create or replace function public.recommend_hr_request(p_id uuid, p_support boolean, p_note text default null)
returns public.hr_requests
language plpgsql
security definer
set search_path = public
as $$
declare r public.hr_requests;
begin
  select * into r from public.hr_requests where id = p_id for update;
  if not found then raise exception 'Request not found'; end if;
  if r.request_type = 'workplace_issue' or not public.is_line_manager_of(r.organization_id, r.user_id, auth.uid()) then
    raise exception 'Only this person''s line manager can add a recommendation' using errcode = '42501';
  end if;
  if r.status not in ('submitted', 'in_review', 'in_progress') then raise exception 'This request has already been decided'; end if;
  if p_support is null then raise exception 'Say whether you support the request'; end if;
  if not p_support and coalesce(trim(p_note), '') = '' then raise exception 'Say why you don''t support it'; end if;

  update public.hr_requests set manager_user_id = auth.uid(), manager_support = p_support,
    manager_note = nullif(trim(coalesce(p_note, '')), ''), manager_at = now()
  where id = p_id returning * into r;

  perform public.notify_user(r.organization_id, m.user_id, auth.uid(), 'hr'::public.notification_category, 'hr_request.recommended', 'hr_request', r.id,
    coalesce((select full_name from public.profiles where id = auth.uid()), 'The line manager')
      || case when p_support then ' supports ' else ' does not support ' end || 'the HR request: ' || r.subject, 'info'::public.notification_priority)
  from public.memberships m
  where m.organization_id = r.organization_id and m.status = 'active' and m.user_id not in (r.user_id, auth.uid())
    and public.approval_allows(r.organization_id, 'hr_request', m.user_id, public.employee_branch(r.organization_id, r.user_id), r.user_id);
  return r;
end;
$$;
grant execute on function public.recommend_hr_request(uuid, boolean, text) to authenticated;
