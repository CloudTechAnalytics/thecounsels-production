-- ============================================================================
-- Migration 0189 — "Who approves what": the firm chooses its approvers.
--
-- A firm-wide Managing Partner picks, per area and optionally per branch,
-- which roles and/or named people approve. A rule only NARROWS approval to
-- people who already hold the area's permission; with no rule the built-in
-- defaults apply exactly as before.
--
--   area           base permission     enforced in
--   leave          leave.manage        review_leave_request (+ who is notified)
--   hr_request     hr_requests.manage  update_hr_request_status
--   payroll        payroll.manage      approve_payroll_run (preparing stays as is)
--   salary         payroll.manage      employee_salaries insert/update
--   fund_finance   funds.manage        pay out, verify expenses/refunds, pay
--                                      reimbursements, close (+ notifications)
--   reimbursement  funds.approve       can_approve_reimbursement
-- Fund-request approval chains keep their own, richer workflows.
--
-- Always true, whatever the rules say: nobody approves their own request;
-- an active delegation lets a stand-in act for a named approver; and if no
-- one named could act on a given request (wrong branch, or only the
-- requester), it falls back to the default approvers so nothing is stranded.
-- ============================================================================

create table if not exists public.approval_rules (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  area              text not null check (area in ('leave', 'hr_request', 'payroll', 'salary', 'fund_finance', 'reimbursement')),
  branch_id         uuid references public.branches(id) on delete cascade,
  approver_roles    text[] not null default '{}',
  approver_user_ids uuid[] not null default '{}',
  updated_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (cardinality(approver_roles) + cardinality(approver_user_ids) > 0)
);
create unique index if not exists approval_rules_unique
  on public.approval_rules (organization_id, area, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

create or replace function public.approval_area_permission(p_area text)
returns text
language sql
immutable
as $$
  select case p_area
    when 'leave' then 'leave.manage'
    when 'hr_request' then 'hr_requests.manage'
    when 'payroll' then 'payroll.manage'
    when 'salary' then 'payroll.manage'
    when 'fund_finance' then 'funds.manage'
    when 'reimbursement' then 'funds.approve'
  end;
$$;

-- Does a rule name this person (directly or by role)?
create or replace function public.approval_rule_names(p_rule public.approval_rules, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = any(p_rule.approver_user_ids)
      or coalesce(public.member_role_key(p_rule.organization_id, p_user), '') = any(p_rule.approver_roles);
$$;
revoke execute on function public.approval_rule_names(public.approval_rules, uuid) from public, anon, authenticated;

-- The single test every approval in these areas goes through.
create or replace function public.approval_allows(p_org uuid, p_area text, p_user uuid, p_branch uuid, p_requester uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_perm text := public.approval_area_permission(p_area);
  r public.approval_rules;
begin
  if p_user is null or v_perm is null then
    return false;
  end if;
  if not public.member_has_permission(p_org, p_user, v_perm)
     or not public.member_has_branch_access(p_org, p_user, p_branch) then
    return false;
  end if;

  select * into r from public.approval_rules
  where organization_id = p_org and area = p_area and (branch_id = p_branch or branch_id is null)
  order by (branch_id is null)
  limit 1;
  if r.id is null then
    return true;  -- no rule: everyone with the permission, as before
  end if;

  if public.approval_rule_names(r, p_user) then
    return true;
  end if;
  -- Standing in for a named approver who has delegated to this person.
  if exists (
    select 1 from public.approval_delegations d
    where d.organization_id = p_org and d.delegate_user_id = p_user and d.is_active
      and current_date between d.starts_on and d.ends_on
      and public.approval_rule_names(r, d.delegator_user_id)
  ) then
    return true;
  end if;
  -- Nobody named can act on this one: fall back to the default approvers.
  return not exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.status = 'active'
      and m.user_id is distinct from p_requester
      and public.approval_rule_names(r, m.user_id)
      and public.member_has_permission(p_org, m.user_id, v_perm)
      and public.member_has_branch_access(p_org, m.user_id, p_branch)
  );
end;
$$;
revoke execute on function public.approval_allows(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

-- Rules must name someone who can actually approve in that area.
create or replace function public.validate_approval_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perm text := public.approval_area_permission(new.area);
  k text;
  u uuid;
begin
  new.approver_roles := array(select distinct x from unnest(new.approver_roles) x where coalesce(x, '') <> '');
  new.approver_user_ids := array(select distinct x from unnest(new.approver_user_ids) x where x is not null);
  if cardinality(new.approver_roles) + cardinality(new.approver_user_ids) = 0 then
    raise exception 'Choose at least one approver — a role or a person';
  end if;
  if new.branch_id is not null and not exists (select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'Branch not found';
  end if;
  foreach k in array new.approver_roles loop
    if not exists (
      select 1 from public.roles ro
      join public.role_permissions rp on rp.role_id = ro.id
      join public.permissions p on p.id = rp.permission_id and p.key = v_perm
      where ro.key::text = k and (ro.organization_id is null or ro.organization_id = new.organization_id)
    ) then
      raise exception 'The role "%" does not have access to approve this', k;
    end if;
  end loop;
  foreach u in array new.approver_user_ids loop
    if not public.member_has_permission(new.organization_id, u, v_perm) then
      raise exception '% does not have access to approve this — change their role first',
        coalesce((select full_name from public.profiles where id = u), 'That person');
    end if;
  end loop;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
drop trigger if exists trg_validate_approval_rule on public.approval_rules;
create trigger trg_validate_approval_rule
  before insert or update on public.approval_rules
  for each row execute function public.validate_approval_rule();

create or replace function public.audit_approval_rule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.approval_rules := coalesce(new, old);
  v_label text := case r.area
    when 'leave' then 'Leave' when 'hr_request' then 'HR requests' when 'payroll' then 'Payroll approval'
    when 'salary' then 'Salary changes' when 'fund_finance' then 'Fund payouts & verification'
    when 'reimbursement' then 'Reimbursement claims' end
    || coalesce(' (' || (select name from public.branches where id = r.branch_id) || ')', '');
  v_who text;
begin
  if tg_op <> 'DELETE' then
    select string_agg(x, ', ') into v_who from (
      select initcap(replace(k, '_', ' ')) x from unnest(new.approver_roles) k
      union all
      select coalesce(p.full_name, 'Someone') from unnest(new.approver_user_ids) u join public.profiles p on p.id = u
    ) s;
  end if;
  perform public.log_audit(r.organization_id, 'approval_rules.changed', 'approval_rule', r.id,
    case when tg_op = 'DELETE' then v_label || ' approvers reset to the default'
         else v_label || ' approved by: ' || coalesce(v_who, '—') end,
    jsonb_build_object('area', r.area, 'branch_id', r.branch_id,
      'roles', case when tg_op <> 'DELETE' then to_jsonb(new.approver_roles) end,
      'people', case when tg_op <> 'DELETE' then to_jsonb(new.approver_user_ids) end));
  return null;
end;
$$;
drop trigger if exists trg_audit_approval_rule on public.approval_rules;
create trigger trg_audit_approval_rule
  after insert or update or delete on public.approval_rules
  for each row execute function public.audit_approval_rule();

alter table public.approval_rules enable row level security;
drop policy if exists approval_rules_select on public.approval_rules;
create policy approval_rules_select on public.approval_rules
  for select using (public.is_org_member(organization_id));
drop policy if exists approval_rules_write on public.approval_rules;
create policy approval_rules_write on public.approval_rules
  for all using (public.is_org_admin(organization_id) and public.user_is_firm_wide(organization_id))
  with check (public.is_org_admin(organization_id) and public.user_is_firm_wide(organization_id));

-- Who may be chosen, per area (for the settings page).
create or replace function public.approval_candidates(p_org uuid)
returns table (area text, kind text, value text, label text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  with areas(area) as (values ('leave'), ('hr_request'), ('payroll'), ('salary'), ('fund_finance'), ('reimbursement'))
  select a.area, 'role', ro.key::text, ro.name, null
  from areas a
  join public.roles ro on ro.organization_id is null or ro.organization_id = p_org
  where public.is_org_member(p_org)
    and ro.key::text not like 'platform%'
    and exists (
      select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
      where rp.role_id = ro.id and p.key = public.approval_area_permission(a.area))
  union all
  select a.area, 'person', m.user_id::text, coalesce(pr.full_name, pr.email), ro.name
  from areas a
  join public.memberships m on m.organization_id = p_org and m.status = 'active'
  join public.profiles pr on pr.id = m.user_id
  join public.roles ro on ro.id = m.role_id
  where public.is_org_member(p_org)
    and public.member_has_permission(p_org, m.user_id, public.approval_area_permission(a.area));
$$;
grant execute on function public.approval_candidates(uuid) to authenticated;

-- What the signed-in user may approve: per area, for the whole firm (null)
-- and for each branch — lets the UI show only the buttons that will work.
create or replace function public.my_approval_rights(p_org uuid)
returns table (area text, branch_id uuid, allowed boolean)
language sql
stable
security definer
set search_path = public
as $$
  with areas(area) as (values ('leave'), ('hr_request'), ('payroll'), ('salary'), ('fund_finance'), ('reimbursement')),
       scopes(branch_id) as (select null::uuid union all select b.id from public.branches b where b.organization_id = p_org)
  select a.area, s.branch_id, public.approval_allows(p_org, a.area, auth.uid(), s.branch_id, null)
  from areas a cross join scopes s
  where public.is_org_member(p_org);
$$;
grant execute on function public.my_approval_rights(uuid) to authenticated;

-- Salaries: same branch rule as 0188, plus the firm's chosen approvers.
drop policy if exists "employee_salaries_insert" on public.employee_salaries;
create policy "employee_salaries_insert" on public.employee_salaries
  for insert with check (
    public.org_has_feature(organization_id, 'hr_module')
    and exists (
      select 1 from public.employees e
      where e.id = employee_salaries.employee_id
        and public.approval_allows(employee_salaries.organization_id, 'salary', auth.uid(), e.branch_id, e.user_id)
        and (public.user_is_firm_wide(employee_salaries.organization_id)
             or (e.user_id is distinct from auth.uid() and public.user_has_branch_access(employee_salaries.organization_id, e.branch_id)))
    )
  );
drop policy if exists "employee_salaries_update" on public.employee_salaries;
create policy "employee_salaries_update" on public.employee_salaries
  for update
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_salaries.employee_id
        and public.approval_allows(employee_salaries.organization_id, 'salary', auth.uid(), e.branch_id, e.user_id)
        and (public.user_is_firm_wide(employee_salaries.organization_id)
             or (e.user_id is distinct from auth.uid() and public.user_has_branch_access(employee_salaries.organization_id, e.branch_id)))
    )
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_salaries.employee_id
        and public.approval_allows(employee_salaries.organization_id, 'salary', auth.uid(), e.branch_id, e.user_id)
        and (public.user_is_firm_wide(employee_salaries.organization_id)
             or (e.user_id is distinct from auth.uid() and public.user_has_branch_access(employee_salaries.organization_id, e.branch_id)))
    )
  );

-- ---------------------------------------------------------------------------
-- Existing approval functions, now asking approval_allows instead of only
-- the permission. Bodies are otherwise unchanged.
-- ---------------------------------------------------------------------------

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
  if not public.approval_allows(rec.organization_id, 'leave', auth.uid(), public.employee_branch(rec.organization_id, rec.user_id), rec.user_id) then
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
$function$;

CREATE OR REPLACE FUNCTION public.update_hr_request_status(p_request uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS hr_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public.approval_allows(rec.organization_id, 'hr_request', auth.uid(), public.employee_branch(rec.organization_id, rec.user_id), rec.user_id) then
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
$function$;

CREATE OR REPLACE FUNCTION public.approve_payroll_run(p_run uuid)
 RETURNS payroll_runs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.payroll_runs;
  v_label text;
begin
  select * into rec from public.payroll_runs where id = p_run for update;
  if rec.id is null then
    raise exception 'Payroll run not found';
  end if;
  if not public.approval_allows(rec.organization_id, 'payroll', auth.uid(), null, rec.created_by) then
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_fund_managers(p_request uuid, p_action text, p_title text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    and public.approval_allows(fr.organization_id, 'fund_finance', m.user_id, fr.branch_id, fr.user_id)
    and public.member_has_branch_access(fr.organization_id, m.user_id, fr.branch_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_retirement_overdue_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and public.approval_allows(r.organization_id, 'fund_finance', m.user_id, r.branch_id, r.user_id)
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
$function$;

CREATE OR REPLACE FUNCTION public.can_approve_reimbursement(p_request uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request and fr.user_id <> p_user
      and public.approval_allows(fr.organization_id, 'reimbursement', p_user, fr.branch_id, fr.user_id)
      and public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id)
  );
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
    and public.approval_allows(p_org, 'leave', m.user_id, public.employee_branch(p_org, auth.uid()), auth.uid());

  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.close_fund_retirement(p_request uuid, p_note text DEFAULT NULL::text)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot close your own advance';
  end if;
  rec := public.settle_fund_request(rec.id);
  if rec.status <> 'retired' then
    raise exception 'Only a fully retired advance (zero balance, nothing pending) can be closed';
  end if;
  update public.fund_requests set status = 'closed', retirement_status = 'closed', closed_at = now(), closed_by = auth.uid(), updated_at = now()
  where id = rec.id returning * into rec;
  perform public.log_audit(rec.organization_id, 'funds.closed', 'fund_request', rec.id,
    'Advance ' || rec.request_number || ' reconciled and closed', jsonb_build_object('note', p_note,
      'disbursed', rec.disbursed_amount, 'verified', rec.accepted_amount, 'refunded', rec.refunded_amount, 'reimbursed', rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.closed', 'fund_request', rec.id,
    'Your advance ' || rec.request_number || ' is fully reconciled and closed', 'info');
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.disburse_fund_request(p_request uuid, p_amount numeric, p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_paid_on date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.fund_requests;
  v_days integer;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status not in ('approved', 'payment_processing') then
    raise exception 'Only approved requests can be paid out';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount paid must be greater than zero';
  end if;
  if p_amount > coalesce(rec.approved_amount, rec.amount) then
    raise exception 'Amount paid cannot be more than the approved amount (₦%)', coalesce(rec.approved_amount, rec.amount);
  end if;
  if rec.user_id = auth.uid() and not public.fund_self_approval_allowed(rec.id) then
    raise exception 'You cannot pay out your own request';
  end if;

  update public.fund_requests
  set status = 'disbursed', disbursed_amount = round(p_amount, 2), disbursed_at = now(), disbursed_by = auth.uid(),
      payment_date = coalesce(p_paid_on, current_date),
      disbursement_method = nullif(trim(coalesce(p_method, '')), ''),
      disbursement_reference = nullif(trim(coalesce(p_reference, '')), ''),
      disbursement_notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = rec.id
  returning * into rec;

  select coalesce(retirement_due_days, 14) into v_days from public.fund_settings where organization_id = rec.organization_id;
  perform public.log_audit(rec.organization_id, 'funds.disbursed', 'fund_request', rec.id,
    'Fund request ' || rec.request_number || ' paid out',
    jsonb_build_object('amount', rec.disbursed_amount, 'method', rec.disbursement_method, 'reference', rec.disbursement_reference, 'paid_on', rec.payment_date));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.disbursed',
    'fund_request', rec.id,
    'Funds for ' || rec.request_number || ' have been paid out — retire them with receipts within ' || coalesce(v_days, 14) || ' days',
    'info');
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_fund_payment_processing(p_request uuid)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'approved' then
    raise exception 'Only approved requests can move to payment processing';
  end if;
  update public.fund_requests set status = 'payment_processing', updated_at = now() where id = rec.id returning * into rec;
  perform public.log_audit(rec.organization_id, 'funds.payment_processing', 'fund_request', rec.id,
    'Payment processing started for ' || rec.request_number);
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pay_fund_reimbursement(p_claim uuid, p_paid_on date DEFAULT NULL::date, p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  claim public.fund_refunds;
  rec public.fund_requests;
begin
  select * into claim from public.fund_refunds where id = p_claim and direction = 'reimbursement' for update;
  if claim.id is null then
    raise exception 'Reimbursement claim not found';
  end if;
  select * into rec from public.fund_requests where id = claim.request_id for update;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot pay a reimbursement to yourself — another finance manager must';
  end if;
  if claim.status <> 'approved' then
    raise exception 'Only an approved reimbursement can be paid (this one is %)', claim.status;
  end if;

  update public.fund_refunds set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
    received_on = coalesce(p_paid_on, current_date),
    method = nullif(trim(coalesce(p_method, '')), ''), reference = nullif(trim(coalesce(p_reference, '')), ''),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = claim.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.reimbursed', 'fund_request', rec.id,
    'Reimbursement of ₦' || to_char(claim.approved_amount, 'FM999,999,999,990.00') || ' paid for ' || rec.request_number,
    jsonb_build_object('claim_id', claim.id, 'amount', claim.approved_amount, 'method', p_method, 'reference', p_reference));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.reimbursed', 'fund_request', rec.id,
    '₦' || to_char(claim.approved_amount, 'FM999,999,999,990.00') || ' reimbursed to you for ' || rec.request_number, 'info');
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_fund_refund(p_request uuid, p_amount numeric, p_received_on date DEFAULT NULL::date, p_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.fund_requests;
  v_open numeric(14,2);
  v_refund uuid;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot record a refund on your own advance — another finance manager must';
  end if;
  if rec.status not in ('disbursed', 'partially_retired', 'retirement_submitted') then
    raise exception 'Refunds can only be recorded while an advance is still open';
  end if;
  v_open := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount - rec.pending_refunds;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund must be greater than zero';
  end if;
  if p_amount > v_open then
    raise exception 'Refund (₦%) is more than the unaccounted balance (₦%) — confirm any declared refunds first', p_amount, greatest(v_open, 0);
  end if;

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, method, reference, notes,
                                   direction, status, declared_by, declared_at, confirmed_by, confirmed_at, recorded_by)
  values (rec.organization_id, rec.id, round(p_amount, 2), coalesce(p_received_on, current_date),
          nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
          'refund', 'confirmed', auth.uid(), now(), auth.uid(), now(), auth.uid())
  returning id into v_refund;
  update public.fund_requests set last_retirement_at = now() where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.refund_confirmed', 'fund_request', rec.id,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' received and confirmed for ' || rec.request_number,
    jsonb_build_object('refund_id', v_refund, 'amount', p_amount, 'method', p_method, 'reference', p_reference,
                       'outstanding', rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.refund_confirmed', 'fund_request', rec.id,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' received for ' || rec.request_number
      || case when rec.status = 'retired' then ' — this advance is fully retired' else '' end,
    'info');
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_retirement_items(p_request uuid, p_decisions jsonb)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.fund_requests;
  d jsonb;
  it public.fund_retirement_items;
  v_accept numeric(14,2) := 0;
  v_reject numeric(14,2) := 0;
  v_return integer := 0;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot verify expenses on your own advance';
  end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    raise exception 'No decisions given';
  end if;

  for d in select * from jsonb_array_elements(p_decisions) loop
    select * into it from public.fund_retirement_items
    where id = (d->>'id')::uuid and request_id = rec.id for update;
    if it.id is null then
      raise exception 'Expense line not found on this request';
    end if;
    if it.review_status <> 'submitted' then
      raise exception 'Line "%" is not awaiting verification', it.description;
    end if;
    if d->>'decision' not in ('accept', 'reject', 'return') then
      raise exception 'Unknown decision for "%"', it.description;
    end if;
    if d->>'decision' in ('reject', 'return') and coalesce(trim(d->>'comment'), '') = '' then
      raise exception 'Give a reason for "%"', it.description;
    end if;
    update public.fund_retirement_items set
      review_status = case d->>'decision' when 'accept' then 'accepted' when 'reject' then 'rejected' else 'draft' end,
      reviewed_at = now(), reviewed_by = auth.uid(),
      review_comment = nullif(trim(coalesce(d->>'comment', '')), '')
    where id = it.id;
    if d->>'decision' = 'accept' then v_accept := v_accept + it.amount;
    elsif d->>'decision' = 'reject' then v_reject := v_reject + it.amount;
    else v_return := v_return + 1; end if;
  end loop;

  update public.fund_requests set retirement_reviewed_by = auth.uid(), retirement_reviewed_at = now() where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.expenses_verified', 'fund_request', rec.id,
    'Expenses reviewed for ' || rec.request_number || ': ₦' || to_char(v_accept, 'FM999,999,999,990.00') || ' verified'
      || case when v_reject > 0 then ', ₦' || to_char(v_reject, 'FM999,999,999,990.00') || ' rejected' else '' end
      || case when v_return > 0 then ', ' || v_return || ' returned for correction' else '' end,
    jsonb_build_object('verified', v_accept, 'rejected', v_reject, 'returned', v_return, 'decisions', p_decisions,
                       'outstanding', rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.expenses_verified', 'fund_request', rec.id,
    'Finance reviewed your expenses for ' || rec.request_number
      || case when rec.status = 'retired' then ' — fully retired'
              when rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount > 0
                then ' — ₦' || to_char(rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount, 'FM999,999,999,990.00') || ' still to account for'
              else '' end,
    'info');
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_retirement_due_date(p_request uuid, p_due date)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then raise exception 'Fund request not found'; end if;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot change the deadline on your own advance';
  end if;
  update public.fund_requests set retirement_due_date = p_due, last_overdue_notice_on = null, updated_at = now() where id = rec.id returning * into rec;
  perform public.log_audit(rec.organization_id, 'funds.due_date_changed', 'fund_request', rec.id,
    'Retirement deadline for ' || rec.request_number || ' set to ' || to_char(p_due, 'DD Mon YYYY'));
  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.verify_fund_refund(p_refund uuid, p_confirm boolean, p_reason text DEFAULT NULL::text, p_allow_excess boolean DEFAULT false)
 RETURNS fund_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ref public.fund_refunds;
  rec public.fund_requests;
  v_open numeric(14,2);
begin
  select * into ref from public.fund_refunds where id = p_refund for update;
  if ref.id is null then
    raise exception 'Refund not found';
  end if;
  select * into rec from public.fund_requests where id = ref.request_id for update;
  if not public.approval_allows(rec.organization_id, 'fund_finance', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot verify a refund on your own advance';
  end if;
  if ref.status <> 'declared' then
    raise exception 'This refund has already been %', ref.status;
  end if;
  if not p_confirm and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for rejecting the refund';
  end if;

  if p_confirm then
    -- What's still unaccounted for once already-confirmed money is counted.
    v_open := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount;
    if ref.amount > v_open and not p_allow_excess then
      raise exception 'This refund (₦%) is more than the unaccounted balance (₦%). Confirm it as an exception with a reason if the money was genuinely received.', ref.amount, greatest(v_open, 0);
    end if;
    if ref.amount > v_open and coalesce(trim(p_reason), '') = '' then
      raise exception 'Give a reason for accepting a refund above the balance';
    end if;
    update public.fund_refunds set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
      is_exception = ref.amount > v_open, exception_reason = case when ref.amount > v_open then trim(p_reason) end
    where id = ref.id;
  else
    update public.fund_refunds set status = 'rejected', confirmed_by = auth.uid(), confirmed_at = now(), rejection_reason = trim(p_reason)
    where id = ref.id;
  end if;

  rec := public.settle_fund_request(rec.id);
  perform public.log_audit(rec.organization_id, case when p_confirm then 'funds.refund_confirmed' else 'funds.refund_rejected' end,
    'fund_request', rec.id,
    'Refund of ₦' || to_char(ref.amount, 'FM999,999,999,990.00') || case when p_confirm then ' confirmed' else ' rejected' end || ' for ' || rec.request_number,
    jsonb_build_object('refund_id', ref.id, 'amount', ref.amount, 'reason', p_reason, 'exception', p_confirm and ref.amount > coalesce(v_open, 0),
                       'outstanding', rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_confirm then 'funds.refund_confirmed' else 'funds.refund_rejected' end, 'fund_request', rec.id,
    case when p_confirm then 'Your refund of ₦' || to_char(ref.amount, 'FM999,999,999,990.00') || ' for ' || rec.request_number || ' was confirmed'
         else 'Your refund declaration for ' || rec.request_number || ' was rejected: ' || trim(p_reason) end,
    'info');
  return rec;
end;
$function$;
