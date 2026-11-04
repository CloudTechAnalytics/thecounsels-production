-- ============================================================================
-- Migration 0182 — HR & Finance respects branch access scope.
--
-- Uses the same rule as matters/clients (0113 user_has_branch_access): a
-- membership scoped to the whole firm reaches every branch; one scoped to
-- branch(es) reaches only those. A record with no branch is reachable by
-- everyone who otherwise qualifies. What it governs here:
--
--   * Fund requests — a branch-scoped approver / finance user only sees and
--     acts on requests from their branch(es): approving (role/permission
--     steps), paying out, verifying expenses, confirming refunds, closing.
--     People named on a request (line manager, department head, a specific
--     person) can still act on it. Requesters always see their own.
--     Because firm-wide users reach every branch, a branch with no approver
--     or finance person of its own falls through to them automatically.
--   * Leave and HR requests — approvers see/act on their branch's staff.
--   * Employee register — branch-scoped HR sees/edits their branch's
--     employees. Payroll managers keep firm-wide reach (payroll is run
--     centrally), as do people looking at their own record.
-- Notifications follow the same rule, so nobody is pinged about a branch
-- they can't open.
-- ============================================================================

-- Branch access for ANOTHER member (user_has_branch_access checks the caller).
create or replace function public.member_has_branch_access(p_org uuid, p_user uuid, p_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_branch is null
    or exists (
      select 1 from public.memberships m
      where m.user_id = p_user and m.organization_id = p_org and m.status = 'active' and m.access_scope = 'organization'
    )
    or exists (
      select 1 from public.memberships m
      join public.member_branches mb on mb.membership_id = m.id
      where m.user_id = p_user and m.organization_id = p_org and m.status = 'active' and mb.branch_id = p_branch
    );
$$;
revoke execute on function public.member_has_branch_access(uuid, uuid, uuid) from public, anon, authenticated;

-- The branch an employee belongs to (register first, staff profile second).
create or replace function public.employee_branch(p_org uuid, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select branch_id from public.employees where organization_id = p_org and user_id = p_user),
    (select branch_id from public.staff_profiles where organization_id = p_org and user_id = p_user)
  );
$$;
grant execute on function public.employee_branch(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fund requests
-- ---------------------------------------------------------------------------
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
    -- Named on the request: may act wherever they sit.
    when 'line_manager' then a.approver_id = p_user
    when 'department_head' then a.approver_id = p_user
    when 'specific_user' then a.approver_id = p_user
    -- Pools: only approvers who can reach the request's branch.
    when 'role' then public.member_role_key(fr.organization_id, p_user) = any (string_to_array(replace(coalesce(a.approver_value, ''), ' ', ''), ','))
                     and public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id)
    when 'permission' then public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id)
    else false
  end;
end;
$$;
revoke execute on function public.fund_step_direct(uuid, uuid) from public, anon, authenticated;

create or replace function public.can_view_fund_request(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request
      and (
        fr.user_id = auth.uid()
        or (fr.status <> 'draft' and (
          (
            (public.has_permission(fr.organization_id, 'funds.approve')
              or public.has_permission(fr.organization_id, 'funds.manage')
              or public.member_role_key(fr.organization_id, auth.uid()) in ('managing_partner', 'partner'))
            and public.user_has_branch_access(fr.organization_id, fr.branch_id)
          )
          or exists (
            select 1 from public.fund_request_approvals a
            where a.request_id = fr.id
              and (a.approver_id = auth.uid() or a.acted_by = auth.uid() or public.fund_step_acting_for(a.id, auth.uid()) is not null)
          )
        ))
      )
  );
$$;

-- Every finance action (payout, verification, refunds, reimbursement,
-- deadline, closure) ends by updating the request row, so one guard here
-- covers them all: someone acting on another person's request must reach
-- its branch or be named on it. Scheduled jobs (no auth.uid()) pass.
create or replace function public.guard_fund_request_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id = auth.uid() then
    return new;
  end if;
  if public.user_has_branch_access(new.organization_id, new.branch_id) then
    return new;
  end if;
  if exists (
    select 1 from public.fund_request_approvals a
    where a.request_id = new.id and (a.approver_id = auth.uid() or a.acted_by = auth.uid())
  ) then
    return new;
  end if;
  raise exception 'This request belongs to a branch you don''t have access to' using errcode = '42501';
end;
$$;
drop trigger if exists trg_guard_fund_request_branch on public.fund_requests;
create trigger trg_guard_fund_request_branch
  before update on public.fund_requests
  for each row execute function public.guard_fund_request_branch();

create or replace function public.notify_fund_managers(p_request uuid, p_action text, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.fund_requests;
begin
  select * into fr from public.fund_requests where id = p_request;
  perform public.notify_user(fr.organization_id, m.user_id, auth.uid(), 'hr', p_action,
    'fund_request', fr.id, p_title, 'info')
  from public.memberships m
  where m.organization_id = fr.organization_id and m.status = 'active'
    and m.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and m.user_id <> fr.user_id
    and public.member_has_permission(fr.organization_id, m.user_id, 'funds.manage')
    and public.member_has_branch_access(fr.organization_id, m.user_id, fr.branch_id);
end;
$$;
revoke execute on function public.notify_fund_managers(uuid, text, text) from public, anon, authenticated;

create or replace function public.run_retirement_overdue_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
  v_owed numeric(14,2);
  v_mgr uuid;
  v_title text;
begin
  for r in
    select * from public.fund_requests
    where status in ('disbursed', 'partially_retired')
      and retirement_due_date is not null and retirement_due_date < current_date
      and (last_overdue_notice_on is null or last_overdue_notice_on < current_date)
  loop
    v_owed := r.disbursed_amount - r.accepted_amount - r.refunded_amount + r.reimbursed_amount;
    continue when v_owed <= 0;
    v_title := 'Retirement overdue: ' || r.request_number || ' — ₦' || to_char(v_owed, 'FM999,999,999,990.00')
      || ' unaccounted for since ' || to_char(r.retirement_due_date, 'DD Mon');
    perform public.notify_user(r.organization_id, r.user_id, null, 'hr', 'funds.retirement_overdue', 'fund_request', r.id, v_title, 'warning');
    perform public.notify_user(r.organization_id, m.user_id, null, 'hr', 'funds.retirement_overdue', 'fund_request', r.id, v_title, 'info')
    from public.memberships m
    where m.organization_id = r.organization_id and m.status = 'active' and m.user_id <> r.user_id
      and public.member_has_permission(r.organization_id, m.user_id, 'funds.manage')
      and public.member_has_branch_access(r.organization_id, m.user_id, r.branch_id);
    select mgr.user_id into v_mgr
    from public.employees e join public.employees mgr on mgr.id = e.manager_employee_id
    where e.organization_id = r.organization_id and e.user_id = r.user_id;
    if v_mgr is not null and v_mgr <> r.user_id then
      perform public.notify_user(r.organization_id, v_mgr, null, 'hr', 'funds.retirement_overdue', 'fund_request', r.id, v_title, 'info');
    end if;
    update public.fund_requests set last_overdue_notice_on = current_date where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.run_retirement_overdue_reminders() from public, anon, authenticated;

-- Requests from before branches were recorded on them: take the requester's branch.
update public.fund_requests fr set branch_id = public.employee_branch(fr.organization_id, fr.user_id)
where fr.branch_id is null and public.employee_branch(fr.organization_id, fr.user_id) is not null;

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
drop policy if exists "leave_requests_select" on public.leave_requests;
create policy "leave_requests_select" on public.leave_requests
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'leave.manage')
        and public.user_has_branch_access(organization_id, public.employee_branch(organization_id, user_id)))
  );
drop policy if exists "leave_balances_select" on public.leave_balances;
create policy "leave_balances_select" on public.leave_balances
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'leave.manage')
        and public.user_has_branch_access(organization_id, public.employee_branch(organization_id, user_id)))
  );

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
  if not public.user_has_branch_access(rec.organization_id, public.employee_branch(rec.organization_id, rec.user_id)) then
    raise exception 'This employee is in a branch you don''t have access to' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- HR requests
-- ---------------------------------------------------------------------------
drop policy if exists "hr_requests_select" on public.hr_requests;
create policy "hr_requests_select" on public.hr_requests
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'hr_requests.manage')
        and public.user_has_branch_access(organization_id, public.employee_branch(organization_id, user_id)))
  );

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
  if not public.user_has_branch_access(rec.organization_id, public.employee_branch(rec.organization_id, rec.user_id)) then
    raise exception 'This employee is in a branch you don''t have access to' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- Employee register
-- ---------------------------------------------------------------------------
drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees
  for select using (
    user_id = auth.uid()
    or public.has_permission(organization_id, 'payroll.manage')
    or (
      (public.has_permission(organization_id, 'staff.view')
        or public.has_permission(organization_id, 'staff.manage')
        or public.has_permission(organization_id, 'funds.manage'))
      and public.user_has_branch_access(organization_id, branch_id)
    )
  );
drop policy if exists "employees_insert" on public.employees;
create policy "employees_insert" on public.employees
  for insert with check (
    public.has_permission(organization_id, 'staff.manage') and public.org_has_feature(organization_id, 'hr_module')
    and public.user_has_branch_access(organization_id, branch_id)
  );
drop policy if exists "employees_update" on public.employees;
create policy "employees_update" on public.employees
  for update using (public.has_permission(organization_id, 'staff.manage') and public.user_has_branch_access(organization_id, branch_id))
  with check (public.has_permission(organization_id, 'staff.manage') and public.user_has_branch_access(organization_id, branch_id));
drop policy if exists "employees_delete" on public.employees;
create policy "employees_delete" on public.employees
  for delete using (public.has_permission(organization_id, 'staff.manage') and user_id is null and public.user_has_branch_access(organization_id, branch_id));

-- ---------------------------------------------------------------------------
-- Leave request notifications go to approvers who can reach the requester's
-- branch (request_leave's live body, with that one condition added).
-- ---------------------------------------------------------------------------
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
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.permissions perm on perm.id = rp.permission_id and perm.key = 'leave.manage'
  where m.organization_id = p_org
    and m.status = 'active'
    and m.user_id <> auth.uid()
    and public.member_has_branch_access(p_org, m.user_id, public.employee_branch(p_org, auth.uid()));

  return rec;
end;
$function$;
