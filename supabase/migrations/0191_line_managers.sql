-- ============================================================================
-- Migration 0191 — line managers, structured.
--
-- Every staff member reports to a line manager (employees.manager_employee_id).
--   • Leave: the line manager approves their team's leave (final). HR and the
--     firm's leave approvers can still act, so nothing is stuck.
--   • Fund requests: the line manager ENDORSES ("this is genuine work") as the
--     first step — no money authority needed for that — and the final
--     approval stays with Finance / partners by amount. A chain is never left
--     with only an endorsement.
--   • Busy approvers: after fund_settings.escalate_after_hours (default 48)
--     the waiting approver is reminded at half-time and, at full time, the
--     step opens to every approver for the branch (fund steps) or HR is
--     alerted (leave). Runs hourly.
--   • set_line_managers(): HR / Managing Partner set one or many reporting
--     lines at once; no one reports to themselves and no loops.
-- ============================================================================

-- The requester's line manager's login, if any (never themselves).
create or replace function public.line_manager_user(p_org uuid, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select mgr.user_id
       from public.employees e join public.employees mgr on mgr.id = e.manager_employee_id
      where e.organization_id = p_org and e.user_id = p_user and mgr.user_id is not null and mgr.user_id <> p_user
      limit 1),
    (select sp.manager_id from public.staff_profiles sp
      where sp.organization_id = p_org and sp.user_id = p_user and sp.manager_id <> p_user
      limit 1)
  );
$$;
revoke execute on function public.line_manager_user(uuid, uuid) from public, anon;
grant execute on function public.line_manager_user(uuid, uuid) to authenticated;

-- People who report to the signed-in user (drives "My team" in the app).
create or replace function public.my_direct_reports(p_org uuid)
returns table (employee_id uuid, user_id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.user_id, trim(e.first_name || ' ' || e.last_name)
  from public.employees e
  join public.employees me on me.id = e.manager_employee_id
  where e.organization_id = p_org and me.user_id = auth.uid()
    and e.employment_status not in ('resigned', 'terminated', 'former_employee');
$$;
grant execute on function public.my_direct_reports(uuid) to authenticated;

-- Set the line manager for one or many employees (HR / Managing Partner).
create or replace function public.set_line_managers(p_org uuid, p_employee_ids uuid[], p_manager uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_walk uuid;
  v_n integer := 0;
  v_depth integer;
begin
  if not (public.has_permission(p_org, 'staff.manage') or public.has_permission(p_org, 'departments.manage') or public.is_org_admin(p_org)) then
    raise exception 'Only HR or the Managing Partner can set line managers' using errcode = '42501';
  end if;
  if p_manager is not null and not exists (select 1 from public.employees where id = p_manager and organization_id = p_org) then
    raise exception 'Line manager not found';
  end if;
  foreach v_id in array p_employee_ids loop
    if not exists (select 1 from public.employees where id = v_id and organization_id = p_org) then
      continue;
    end if;
    if p_manager = v_id then
      raise exception 'Someone cannot be their own line manager';
    end if;
    -- No loops: the new manager must not (eventually) report to this person.
    v_walk := p_manager;
    v_depth := 0;
    while v_walk is not null and v_depth < 50 loop
      if v_walk = v_id then
        raise exception 'That would create a reporting loop — % already reports (directly or indirectly) to this person',
          (select trim(first_name || ' ' || last_name) from public.employees where id = p_manager);
      end if;
      select manager_employee_id into v_walk from public.employees where id = v_walk;
      v_depth := v_depth + 1;
    end loop;
    update public.employees set manager_employee_id = p_manager, updated_at = now() where id = v_id;
    v_n := v_n + 1;
  end loop;
  perform public.log_audit(p_org, 'employees.line_manager_set', 'employee', p_manager,
    case when p_manager is null then 'Line manager removed for ' || v_n || ' staff'
         else (select trim(first_name || ' ' || last_name) from public.employees where id = p_manager) || ' set as line manager for ' || v_n || ' staff' end,
    jsonb_build_object('employees', p_employee_ids, 'manager', p_manager));
  return v_n;
end;
$$;
grant execute on function public.set_line_managers(uuid, uuid[], uuid) to authenticated;

-- Line managers see their team's leave.
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'leave.manage') and public.user_has_branch_access(organization_id, public.employee_branch(organization_id, user_id)))
    or public.line_manager_user(organization_id, user_id) = auth.uid()
  );

-- Escalation bookkeeping.
alter table public.fund_settings add column if not exists escalate_after_hours integer not null default 48 check (escalate_after_hours between 4 and 720);
alter table public.fund_request_approvals
  add column if not exists reminded_at timestamptz,
  add column if not exists escalated_at timestamptz;
alter table public.leave_requests
  add column if not exists reminded_at timestamptz,
  add column if not exists escalated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Fund requests: the line manager endorses without needing money authority.
-- ---------------------------------------------------------------------------
create or replace function public.fund_resolve_person(p_request uuid, p_type text, p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fr public.fund_requests;
  v uuid;
begin
  select * into fr from public.fund_requests where id = p_request;
  if p_type = 'specific_user' then
    v := p_user;
  elsif p_type = 'line_manager' then
    v := public.line_manager_user(fr.organization_id, fr.user_id);
  elsif p_type = 'department_head' then
    select h.user_id into v
    from public.departments d join public.employees h on h.id = d.head_employee_id
    where d.id = fr.department_id;
  end if;
  if v is null or v = fr.user_id
     or not exists (select 1 from public.memberships m where m.organization_id = fr.organization_id and m.user_id = v and m.status = 'active') then
    return null;
  end if;
  -- Endorsement is about the work, not the money: a line manager needs no approval rights.
  if p_type <> 'line_manager' and not public.member_has_permission(fr.organization_id, v, 'funds.approve') then
    return null;
  end if;
  return v;
end;
$$;

create or replace function public.fund_step_direct(p_approval uuid, p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a public.fund_request_approvals;
  fr public.fund_requests;
begin
  select * into a from public.fund_request_approvals where id = p_approval;
  select * into fr from public.fund_requests where id = a.request_id;
  if a.id is null or p_user is null or fr.user_id = p_user then
    return false;
  end if;
  -- The named line manager endorses their own team member's request.
  if a.approver_type = 'line_manager' and a.approver_id = p_user then
    return true;
  end if;
  if not public.member_has_permission(fr.organization_id, p_user, 'funds.approve') then
    return false;
  end if;
  -- Waited too long: any approver for the branch may now act on this step.
  if a.escalated_at is not null and public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id) then
    return true;
  end if;
  return case a.approver_type
    when 'line_manager' then a.approver_id = p_user
    when 'department_head' then a.approver_id = p_user
    when 'specific_user' then a.approver_id = p_user
    when 'role' then public.member_role_key(fr.organization_id, p_user) = any (string_to_array(replace(coalesce(a.approver_value, ''), ' ', ''), ','))
                     and public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id)
    when 'permission' then public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id)
    else false
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hourly reminders and escalation.
-- ---------------------------------------------------------------------------
create or replace function public.run_approval_escalations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
  v_hours integer;
begin
  -- Fund request steps.
  for r in
    select a.id, a.step_name, fr.id as request_id, fr.organization_id, fr.user_id, fr.branch_id, fr.request_number,
           coalesce((select max(x.acted_at) from public.fund_request_approvals x where x.request_id = fr.id and x.round = fr.current_round), fr.submitted_at, fr.updated_at) as since,
           a.reminded_at, a.escalated_at,
           coalesce(s.escalate_after_hours, 48) as hours
    from public.fund_request_approvals a
    join public.fund_requests fr on fr.id = a.request_id and fr.current_round = a.round
    left join public.fund_settings s on s.organization_id = fr.organization_id
    where fr.status = 'pending' and a.status = 'pending' and a.escalated_at is null
  loop
    if now() - r.since >= make_interval(hours => r.hours) then
      update public.fund_request_approvals set escalated_at = now() where id = r.id;
      perform public.notify_user(r.organization_id, m.user_id, null, 'hr', 'funds.escalated', 'fund_request', r.request_id,
        r.request_number || ' has waited over ' || r.hours || 'h for ' || coalesce(r.step_name, 'approval') || ' — any approver can now act on it', 'warning')
      from public.memberships m
      where m.organization_id = r.organization_id and m.status = 'active' and m.user_id <> r.user_id
        and public.member_has_permission(r.organization_id, m.user_id, 'funds.approve')
        and public.member_has_branch_access(r.organization_id, m.user_id, r.branch_id);
      v_n := v_n + 1;
    elsif r.reminded_at is null and now() - r.since >= make_interval(hours => greatest(r.hours / 2, 1)) then
      update public.fund_request_approvals set reminded_at = now() where id = r.id;
      perform public.notify_user(r.organization_id, m.user_id, null, 'hr', 'funds.reminder', 'fund_request', r.request_id,
        'Reminder: ' || r.request_number || ' is waiting for your ' || lower(coalesce(r.step_name, 'approval')), 'info')
      from public.memberships m
      where m.organization_id = r.organization_id and m.status = 'active'
        and public.fund_step_acting_for(r.id, m.user_id) is not null;
      v_n := v_n + 1;
    end if;
  end loop;

  -- Leave: remind the line manager, then alert HR.
  for r in
    select l.id, l.organization_id, l.user_id, l.created_at, l.reminded_at,
           public.line_manager_user(l.organization_id, l.user_id) as mgr,
           coalesce(s.escalate_after_hours, 48) as hours,
           coalesce((select trim(p.full_name) from public.profiles p where p.id = l.user_id), 'A staff member') as who
    from public.leave_requests l
    left join public.fund_settings s on s.organization_id = l.organization_id
    where l.status = 'pending' and l.escalated_at is null
  loop
    if now() - r.created_at >= make_interval(hours => r.hours) then
      update public.leave_requests set escalated_at = now() where id = r.id;
      perform public.notify_user(r.organization_id, m.user_id, null, 'hr', 'leave.escalated', 'leave_request', r.id,
        r.who || '''s leave request has waited over ' || r.hours || 'h — please review it', 'warning')
      from public.memberships m
      where m.organization_id = r.organization_id and m.status = 'active' and m.user_id <> r.user_id
        and public.approval_allows(r.organization_id, 'leave', m.user_id, public.employee_branch(r.organization_id, r.user_id), r.user_id);
      v_n := v_n + 1;
    elsif r.reminded_at is null and r.mgr is not null and now() - r.created_at >= make_interval(hours => greatest(r.hours / 2, 1)) then
      update public.leave_requests set reminded_at = now() where id = r.id;
      perform public.notify_user(r.organization_id, r.mgr, null, 'hr', 'leave.reminder', 'leave_request', r.id,
        'Reminder: ' || r.who || '''s leave request is waiting for you', 'info');
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.run_approval_escalations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'approval-escalations') then
    perform cron.unschedule('approval-escalations');
  end if;
  perform cron.schedule('approval-escalations', '15 * * * *', 'select public.run_approval_escalations()');
end $$;

-- ---------------------------------------------------------------------------
-- Existing functions, extended (bodies otherwise unchanged).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.build_fund_chain(p_request uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fr public.fund_requests;
  s public.fund_settings;
  wf public.approval_workflows;
  st record;
  v_person uuid;
  v_step integer := 0;
  v_live integer;
  v_first integer;
  v_why text;
begin
  select * into fr from public.fund_requests where id = p_request;
  select * into s from public.fund_settings where organization_id = fr.organization_id;

  select * into wf from public.approval_workflows w
  where w.organization_id = fr.organization_id and w.module = 'fund_request' and w.is_active
    and (w.min_amount is null or fr.amount >= w.min_amount)
    and (w.max_amount is null or fr.amount <= w.max_amount)
    and (cardinality(w.categories) = 0 or fr.category = any (w.categories))
    and (cardinality(w.department_ids) = 0 or fr.department_id = any (w.department_ids))
    and (cardinality(w.branch_ids) = 0 or fr.branch_id = any (w.branch_ids))
    and exists (select 1 from public.approval_workflow_steps x where x.workflow_id = w.id)
  order by w.priority, w.created_at
  limit 1;

  update public.fund_requests set workflow_id = wf.id where id = fr.id;

  if wf.id is not null then
    for st in select * from public.approval_workflow_steps where workflow_id = wf.id order by step_order, created_at loop
      v_person := null;
      v_why := null;
      if st.approver_type in ('line_manager', 'department_head', 'specific_user') then
        v_person := public.fund_resolve_person(fr.id, st.approver_type, st.approver_user_id);
        if v_person is null then
          v_why := 'Skipped — no ' || replace(st.approver_type, '_', ' ') || ' with approval authority for this request';
        end if;
      end if;
      insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_value, approver_id, status, comment)
      values (fr.organization_id, fr.id, fr.current_round, st.step_order, st.approver_type, st.name, st.approver_type,
              case when st.approver_type = 'permission' then 'funds.approve' else st.approver_value end,
              v_person, case when v_why is null then 'waiting' else 'skipped' end, v_why);
    end loop;
  else
    if coalesce(s.require_line_manager, true) then
      v_person := public.fund_resolve_person(fr.id, 'line_manager', null);
      if v_person is not null then
        v_step := v_step + 1;
        insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_id)
        values (fr.organization_id, fr.id, fr.current_round, v_step, 'line_manager', 'Line manager endorsement', 'line_manager', v_person);
      end if;
    end if;
    v_step := v_step + 1;
    insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_value)
    values (fr.organization_id, fr.id, fr.current_round, v_step, 'approver', 'Finance approval', 'permission', 'funds.approve');
    if s.leadership_threshold is not null and fr.amount >= s.leadership_threshold then
      v_step := v_step + 1;
      insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_value)
      values (fr.organization_id, fr.id, fr.current_round, v_step, 'leadership', 'Partner approval', 'role', 'managing_partner,partner');
    end if;
  end if;

  -- Never let a request through with nobody to approve it — an endorsement alone is not an approval.
  select count(*) into v_live from public.fund_request_approvals
  where request_id = fr.id and round = fr.current_round and status = 'waiting' and approver_type <> 'line_manager';
  if v_live = 0 then
    insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_value)
    values (fr.organization_id, fr.id, fr.current_round, 999, 'approver', 'Finance approval', 'permission', 'funds.approve');
  end if;

  select min(step) into v_first from public.fund_request_approvals where request_id = fr.id and round = fr.current_round and status = 'waiting';
  update public.fund_request_approvals set status = 'pending'
  where request_id = fr.id and round = fr.current_round and status = 'waiting' and step = v_first;
  update public.fund_requests set current_step = v_first where id = fr.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_leave_request(p_request uuid, p_approve boolean, p_comment text DEFAULT NULL::text)
 RETURNS leave_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.leave_requests;
  v_year int;
begin
  select * into rec from public.leave_requests where id = p_request;
  if rec.id is null then
    raise exception 'Leave request not found';
  end if;
  -- Their line manager approves; the firm's leave approvers (HR) can too.
  if public.line_manager_user(rec.organization_id, rec.user_id) is distinct from auth.uid() then
    if not public.approval_allows(rec.organization_id, 'leave', auth.uid(), public.employee_branch(rec.organization_id, rec.user_id), rec.user_id) then
      raise exception 'Not permitted — leave is approved by the staff member''s line manager or HR' using errcode = '42501';
    end if;
    if not public.user_has_branch_access(rec.organization_id, public.employee_branch(rec.organization_id, rec.user_id)) then
      raise exception 'This employee is in a branch you don''t have access to' using errcode = '42501';
    end if;
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot approve your own leave — another approver must review it.';
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
$function$;

CREATE OR REPLACE FUNCTION public.request_leave(p_org uuid, p_leave_type uuid, p_start date, p_end date, p_reason text DEFAULT NULL::text)
 RETURNS leave_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.leave_requests;
  v_days numeric(6,2);
  v_year int;
  v_limit numeric(6,2);
  v_taken numeric(6,2);
  v_type_name text;
begin
  if not public.has_permission(p_org, 'leave.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'HR & People Management is not included in your plan. Upgrade to Business to use it.';
  end if;
  if p_end < p_start then
    raise exception 'End date must be on or after the start date';
  end if;
  v_days := (p_end - p_start + 1);
  v_year := extract(year from p_start)::int;

  select name into v_type_name from public.leave_types where id = p_leave_type and organization_id = p_org;
  if v_type_name is null then
    raise exception 'Unknown leave type';
  end if;

  select coalesce(b.entitlement_days, t.default_entitlement_days), coalesce(b.used_days, 0)
    into v_limit, v_taken
    from public.leave_types t
    left join public.leave_balances b
      on b.organization_id = p_org and b.user_id = auth.uid() and b.leave_type_id = p_leave_type and b.year = v_year
    where t.id = p_leave_type;

  if v_days > (v_limit - v_taken) then
    raise exception '% requires % day(s), but only % day(s) remain of your % limit', v_type_name, v_days, (v_limit - v_taken), v_limit;
  end if;

  insert into public.leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, reason)
  values (p_org, auth.uid(), p_leave_type, p_start, p_end, v_days, nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;

  perform public.log_audit(p_org, 'leave.requested', 'leave_request', rec.id,
    'Leave requested', jsonb_build_object('leave_type_id', p_leave_type, 'days', v_days));

  perform public.notify_user(p_org, m.user_id, auth.uid(), 'hr', 'leave.requested',
    'leave_request', rec.id, 'A new leave request needs your review', 'info')
  from public.memberships m
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid()
    and public.approval_allows(p_org, 'leave', m.user_id, public.employee_branch(p_org, auth.uid()), auth.uid())
    and m.user_id is distinct from public.line_manager_user(p_org, auth.uid());

  -- The line manager approves their team's leave.
  if public.line_manager_user(p_org, auth.uid()) is not null then
    perform public.notify_user(p_org, public.line_manager_user(p_org, auth.uid()), auth.uid(), 'hr', 'leave.requested',
      'leave_request', rec.id, 'A team member''s leave request needs your approval', 'info');
  end if;

  return rec;
end;
$function$;
