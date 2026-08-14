-- ============================================================================
-- Migration 0085 — HR & People Management: block self-approval, and stop
-- inventing leave entitlement numbers.
--
-- 1. Nothing previously stopped an HR-access holder from approving their
--    own leave/HR request. Both RPCs now block that — UNLESS the approver
--    is Managing Partner or Partner, who fall back as the approver when
--    the requester IS the (only) HR person, per explicit instruction.
--
-- 2. The entitlement numbers seeded in 0084 (20/10/5/90/...) were this
--    session's own invented defaults, not the firm's real policy. Reset
--    to 0 for every leave type — HR sets real numbers via the 'Manage
--    lists' section (now with an editable Limit field), nothing assumed.
-- ============================================================================

create or replace function public.review_leave_request(
  p_request uuid,
  p_approve boolean,
  p_comment text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_year int;
  v_is_leadership boolean;
begin
  select * into rec from public.leave_requests where id = p_request;
  if rec.id is null then
    raise exception 'Leave request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'leave.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;

  if rec.user_id = auth.uid() then
    select exists (
      select 1 from public.memberships m join public.roles r on r.id = m.role_id
      where m.organization_id = rec.organization_id and m.user_id = auth.uid()
        and r.key in ('managing_partner', 'partner')
    ) into v_is_leadership;
    if not v_is_leadership then
      raise exception 'You cannot approve your own leave request — ask another HR-access holder, or a Managing Partner/Partner.';
    end if;
  end if;

  update public.leave_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now(), review_comment = p_comment
  where id = p_request
  returning * into rec;

  if p_approve then
    v_year := extract(year from rec.start_date)::int;
    insert into public.leave_balances (organization_id, user_id, leave_type_id, year, entitlement_days, used_days)
    values (
      rec.organization_id, rec.user_id, rec.leave_type_id, v_year,
      coalesce((select default_entitlement_days from public.leave_types where id = rec.leave_type_id), 0),
      rec.days
    )
    on conflict (organization_id, user_id, leave_type_id, year)
    do update set used_days = public.leave_balances.used_days + excluded.used_days, updated_at = now();
  end if;

  perform public.log_audit(rec.organization_id, case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id, case when p_approve then 'Leave approved' else 'Leave rejected' end,
    jsonb_build_object('comment', p_comment));

  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_approve then 'leave.approved' else 'leave.rejected' end,
    'leave_request', rec.id,
    case when p_approve then 'Your leave request was approved' else 'Your leave request was rejected' end,
    'info');

  return rec;
end;
$$;

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
  v_is_leadership boolean;
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

  if rec.user_id = auth.uid() then
    select exists (
      select 1 from public.memberships m join public.roles r on r.id = m.role_id
      where m.organization_id = rec.organization_id and m.user_id = auth.uid()
        and r.key in ('managing_partner', 'partner')
    ) into v_is_leadership;
    if not v_is_leadership then
      raise exception 'You cannot process your own HR request — ask another HR-access holder, or a Managing Partner/Partner.';
    end if;
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

-- Stop assuming entitlement numbers — reset to 0, HR sets real values.
update public.leave_types set default_entitlement_days = 0;

create or replace function public.seed_hr_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leave_types (organization_id, name, default_entitlement_days) values
    (new.id, 'Annual Leave', 0),
    (new.id, 'Sick Leave', 0),
    (new.id, 'Casual Leave', 0),
    (new.id, 'Maternity Leave', 0),
    (new.id, 'Paternity Leave', 0),
    (new.id, 'Compassionate Leave', 0),
    (new.id, 'Study Leave', 0),
    (new.id, 'Exam Leave', 0)
  on conflict (organization_id, name) do nothing;

  insert into public.departments (organization_id, name) values
    (new.id, 'Corporate'),
    (new.id, 'Litigation'),
    (new.id, 'Family'),
    (new.id, 'Real Estate'),
    (new.id, 'Finance'),
    (new.id, 'Administration'),
    (new.id, 'Human Resources'),
    (new.id, 'IT')
  on conflict (organization_id, name) do nothing;

  return new;
end;
$$;
