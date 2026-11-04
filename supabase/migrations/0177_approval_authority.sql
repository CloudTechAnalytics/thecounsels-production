-- ============================================================================
-- Migration 0177 — Only authorised approvers approve; nobody approves
-- their own anything.
--
-- 1. Approval authority for fund requests = holding funds.approve, which
--    is now Managing Partner, Partner, Finance and the HR manager roles.
--    Every approval step — line manager, department head, role, named
--    person — also requires it. A line manager or department head without
--    approval authority is skipped (and the skip is recorded on the request)
--    rather than being allowed to approve.
-- 2. Self-approval is removed outright: no firm setting, no workflow flag,
--    no leadership exception. Applies to fund approvals, payouts,
--    retirement reviews, leave, HR requests, and payroll (whoever prepared
--    a payroll run cannot also approve it).
-- 3. Delegation: only an approver can delegate, and only to another
--    approver. Finance managers can set one up for an approver.
-- ============================================================================

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'funds.approve'
where r.key in ('hr_manager', 'hr_administrator', 'hr')
on conflict do nothing;

-- Callable from RLS policies (member_has_permission itself is internal).
create or replace function public.is_fund_approver(p_org uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.member_has_permission(p_org, p_user, 'funds.approve');
$$;
grant execute on function public.is_fund_approver(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. No self-approval, anywhere.
-- ---------------------------------------------------------------------------
create or replace function public.fund_self_approval_allowed(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select false;
$$;
alter table public.fund_settings drop column if exists allow_self_approval;
alter table public.approval_workflows drop column if exists allow_self_approval;

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
  if not public.member_has_permission(fr.organization_id, p_user, 'funds.approve') then
    return false;
  end if;
  return case a.approver_type
    when 'line_manager' then a.approver_id = p_user
    when 'department_head' then a.approver_id = p_user
    when 'specific_user' then a.approver_id = p_user
    when 'role' then public.member_role_key(fr.organization_id, p_user) = any (string_to_array(replace(coalesce(a.approver_value, ''), ' ', ''), ','))
    when 'permission' then true
    else false
  end;
end;
$$;
revoke execute on function public.fund_step_direct(uuid, uuid) from public, anon, authenticated;

create or replace function public.fund_step_acting_for(p_approval uuid, p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_requester uuid;
  v_for uuid;
begin
  select fr.organization_id, fr.user_id into v_org, v_requester
  from public.fund_request_approvals a join public.fund_requests fr on fr.id = a.request_id where a.id = p_approval;
  if v_org is null or p_user is null or v_requester = p_user then
    return null;
  end if;
  if public.fund_step_direct(p_approval, p_user) then
    return p_user;
  end if;
  -- A delegate must be an approver in their own right, and never the requester.
  if not public.member_has_permission(v_org, p_user, 'funds.approve') then
    return null;
  end if;
  select d.delegator_user_id into v_for
  from public.approval_delegations d
  where d.organization_id = v_org and d.delegate_user_id = p_user and d.is_active
    and current_date between d.starts_on and d.ends_on
    and d.delegator_user_id <> v_requester
    and public.fund_step_direct(p_approval, d.delegator_user_id)
  limit 1;
  return v_for;
end;
$$;
revoke execute on function public.fund_step_acting_for(uuid, uuid) from public, anon, authenticated;

-- Person-steps resolve only to someone with approval authority.
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
    select mgr.user_id into v
    from public.employees e join public.employees mgr on mgr.id = e.manager_employee_id
    where e.organization_id = fr.organization_id and e.user_id = fr.user_id;
    if v is null then
      select sp.manager_id into v from public.staff_profiles sp where sp.organization_id = fr.organization_id and sp.user_id = fr.user_id;
    end if;
  elsif p_type = 'department_head' then
    select h.user_id into v
    from public.departments d join public.employees h on h.id = d.head_employee_id
    where d.id = fr.department_id;
  end if;
  if v is null or v = fr.user_id or not public.member_has_permission(fr.organization_id, v, 'funds.approve') then
    return null;
  end if;
  return v;
end;
$$;
revoke execute on function public.fund_resolve_person(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.build_fund_chain(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
        values (fr.organization_id, fr.id, fr.current_round, v_step, 'line_manager', 'Line manager', 'line_manager', v_person);
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

  -- Never let a request through with nobody to approve it.
  select count(*) into v_live from public.fund_request_approvals where request_id = fr.id and round = fr.current_round and status = 'waiting';
  if v_live = 0 then
    insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_value)
    values (fr.organization_id, fr.id, fr.current_round, 999, 'approver', 'Finance approval', 'permission', 'funds.approve');
  end if;

  select min(step) into v_first from public.fund_request_approvals where request_id = fr.id and round = fr.current_round and status = 'waiting';
  update public.fund_request_approvals set status = 'pending'
  where request_id = fr.id and round = fr.current_round and status = 'waiting' and step = v_first;
  update public.fund_requests set current_step = v_first where id = fr.id;
end;
$$;
revoke execute on function public.build_fund_chain(uuid) from public, anon, authenticated;

-- Retirement review: no exception for anyone reviewing their own.
create or replace function public.review_fund_retirement(
  p_request uuid,
  p_accept boolean,
  p_comment text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'retirement_submitted' then
    raise exception 'There is no submitted retirement to review';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot review your own retirement — another finance manager must review it';
  end if;
  if not p_accept and coalesce(trim(p_comment), '') = '' then
    raise exception 'Say what needs fixing when querying a retirement';
  end if;

  update public.fund_requests
  set status = case when p_accept then 'retired' else 'disbursed' end,
      retired_at = case when p_accept then now() else null end,
      retirement_reviewed_by = auth.uid(), retirement_reviewed_at = now(),
      retirement_comment = nullif(trim(coalesce(p_comment, '')), ''),
      updated_at = now()
  where id = rec.id
  returning * into rec;

  perform public.log_audit(rec.organization_id,
    case when p_accept then 'funds.retired' else 'funds.retirement_queried' end, 'fund_request', rec.id,
    case when p_accept then 'Retirement accepted for ' else 'Retirement queried for ' end || rec.request_number,
    jsonb_build_object('comment', p_comment, 'spent', rec.spent_amount, 'disbursed', rec.disbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_accept then 'funds.retired' else 'funds.retirement_queried' end,
    'fund_request', rec.id,
    case when p_accept then 'Your retirement for ' || rec.request_number || ' was accepted'
         else 'Your retirement for ' || rec.request_number || ' was queried — please review and resubmit' end,
    'info');
  return rec;
end;
$$;

-- Leave: nobody approves their own leave (the leadership exception is gone).
create or replace function public.review_leave_request(p_request uuid, p_approve boolean, p_comment text default null)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.leave_requests;
  v_year int;
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
$$;

-- HR requests: nobody processes their own.
create or replace function public.update_hr_request_status(p_request uuid, p_status text, p_note text default null)
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
  if rec.user_id = auth.uid() then
    raise exception 'You cannot process your own HR request — another HR-access holder must handle it.';
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

-- Payroll: maker-checker — whoever prepared the run can't approve it.
create or replace function public.approve_payroll_run(p_run uuid)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.payroll_runs;
  v_label text;
begin
  select * into rec from public.payroll_runs where id = p_run for update;
  if rec.id is null then
    raise exception 'Payroll run not found';
  end if;
  if not public.has_permission(rec.organization_id, 'payroll.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'draft' then
    raise exception 'Only a draft payroll can be approved';
  end if;
  if rec.created_by = auth.uid() then
    raise exception 'You prepared this payroll, so someone else with payroll access must approve it.';
  end if;
  if not exists (select 1 from public.payslips where run_id = rec.id) then
    raise exception 'This payroll has no payslips yet';
  end if;

  update public.payroll_runs r
  set status = 'approved', approved_by = auth.uid(), approved_at = now(),
      employee_count = t.n, total_gross = t.gross, total_paye = t.paye,
      total_pension_employee = t.pe, total_pension_employer = t.pr, total_nhf = t.nhf,
      total_other_deductions = t.od, total_net = t.net
  from (
    select count(*) n, coalesce(sum(gross),0) gross, coalesce(sum(paye),0) paye,
           coalesce(sum(pension_employee),0) pe, coalesce(sum(pension_employer),0) pr,
           coalesce(sum(nhf),0) nhf, coalesce(sum(other_deductions),0) od, coalesce(sum(net),0) net
    from public.payslips where run_id = p_run
  ) t
  where r.id = p_run
  returning r.* into rec;

  v_label := to_char(rec.period, 'FMMonth YYYY');
  perform public.log_audit(rec.organization_id, 'payroll.approved', 'payroll_run', rec.id,
    'Payroll for ' || v_label || ' approved',
    jsonb_build_object('employees', rec.employee_count, 'gross', rec.total_gross, 'net', rec.total_net));
  perform public.notify_user(rec.organization_id, ps.user_id, auth.uid(), 'hr', 'payroll.payslip_ready',
    'payroll_run', rec.id, 'Your payslip for ' || v_label || ' is ready', 'info')
  from public.payslips ps where ps.run_id = rec.id and ps.user_id is not null;
  return rec;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Delegation: approver -> approver only.
-- ---------------------------------------------------------------------------
drop policy if exists "approval_delegations_insert" on public.approval_delegations;
create policy "approval_delegations_insert" on public.approval_delegations
  for insert with check (
    public.is_fund_approver(organization_id, delegator_user_id)
    and public.is_fund_approver(organization_id, delegate_user_id)
    and (
      (delegator_user_id = auth.uid())
      or public.has_permission(organization_id, 'funds.manage')
    )
  );
drop policy if exists "approval_delegations_update" on public.approval_delegations;
create policy "approval_delegations_update" on public.approval_delegations
  for update using (delegator_user_id = auth.uid() or public.has_permission(organization_id, 'funds.manage'))
  with check (
    (delegator_user_id = auth.uid() or public.has_permission(organization_id, 'funds.manage'))
    and public.is_fund_approver(organization_id, delegate_user_id)
  );

-- Workflow steps may only name a role that can approve.
create or replace function public.check_workflow_step()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
begin
  if new.approver_type = 'role' then
    foreach k in array string_to_array(replace(coalesce(new.approver_value, ''), ' ', ''), ',') loop
      if not exists (
        select 1 from public.roles r
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions p on p.id = rp.permission_id and p.key = 'funds.approve'
        where r.key::text = k
      ) then
        raise exception 'The role "%" cannot approve fund requests', k;
      end if;
    end loop;
  elsif new.approver_type = 'specific_user' then
    if not public.member_has_permission(new.organization_id, new.approver_user_id, 'funds.approve') then
      raise exception 'That person does not have approval authority';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_check_workflow_step on public.approval_workflow_steps;
create trigger trg_check_workflow_step
  before insert or update on public.approval_workflow_steps
  for each row execute function public.check_workflow_step();
