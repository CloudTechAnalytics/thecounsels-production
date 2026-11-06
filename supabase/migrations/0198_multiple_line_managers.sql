-- ============================================================================
-- Migration 0198 — more than one line manager.
--
-- employees.manager_employee_id stays the PRIMARY line manager (the one shown
-- on the org chart and named on fund endorsement steps). A person may also
-- report to ADDITIONAL line managers (employee_line_managers) — common in
-- firms where an associate works for several partners.
--
-- Any of a person's line managers may: approve their leave, endorse their
-- fund requests, approve their inventory requests, and see them as "my
-- team". All of them are notified. Nobody can be their own line manager and
-- reporting loops are refused across primary and additional lines.
-- ============================================================================

create table if not exists public.employee_line_managers (
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  manager_employee_id uuid not null references public.employees(id) on delete cascade,
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  primary key (employee_id, manager_employee_id),
  check (employee_id <> manager_employee_id)
);
create index if not exists idx_employee_line_managers_mgr on public.employee_line_managers (manager_employee_id);
create index if not exists idx_employee_line_managers_org on public.employee_line_managers (organization_id);

alter table public.employee_line_managers enable row level security;
drop policy if exists employee_line_managers_select on public.employee_line_managers;
create policy employee_line_managers_select on public.employee_line_managers
  for select using (public.is_org_member(organization_id));
grant select on public.employee_line_managers to authenticated;

-- Every line manager's login for a person (primary first), never themselves.
create or replace function public.line_manager_users(p_org uuid, p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct u from (
    select mgr.user_id as u
      from public.employees e join public.employees mgr on mgr.id = e.manager_employee_id
     where e.organization_id = p_org and e.user_id = p_user
    union all
    select sp.manager_id from public.staff_profiles sp
     where sp.organization_id = p_org and sp.user_id = p_user
       and not exists (select 1 from public.employees e where e.organization_id = p_org and e.user_id = p_user and e.manager_employee_id is not null)
    union all
    select mgr.user_id
      from public.employees e
      join public.employee_line_managers lm on lm.employee_id = e.id
      join public.employees mgr on mgr.id = lm.manager_employee_id
     where e.organization_id = p_org and e.user_id = p_user
  ) x
  where u is not null and u <> p_user
    and exists (select 1 from public.memberships m where m.organization_id = p_org and m.user_id = u and m.status = 'active');
$$;
revoke execute on function public.line_manager_users(uuid, uuid) from public, anon;
grant execute on function public.line_manager_users(uuid, uuid) to authenticated;

create or replace function public.is_line_manager_of(p_org uuid, p_user uuid, p_manager uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_manager is not null and p_manager <> p_user
     and exists (select 1 from public.line_manager_users(p_org, p_user) u where u = p_manager);
$$;
grant execute on function public.is_line_manager_of(uuid, uuid, uuid) to authenticated;

-- The primary line manager; if none is set, the first additional one.
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
      limit 1),
    (select mgr.user_id
       from public.employees e
       join public.employee_line_managers lm on lm.employee_id = e.id
       join public.employees mgr on mgr.id = lm.manager_employee_id
      where e.organization_id = p_org and e.user_id = p_user and mgr.user_id is not null and mgr.user_id <> p_user
      order by lm.created_at
      limit 1)
  );
$$;

-- Does p_from (eventually) report to p_to, through any line? Used to refuse loops.
create or replace function public.reports_up_to(p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive up(id, depth) as (
    select p_from, 0
    union
    select x.mgr, up.depth + 1
    from up
    cross join lateral (
      select e.manager_employee_id as mgr from public.employees e where e.id = up.id and e.manager_employee_id is not null
      union
      select lm.manager_employee_id from public.employee_line_managers lm where lm.employee_id = up.id
    ) x
    where up.depth < 50
  )
  select exists (select 1 from up where id = p_to and depth > 0);
$$;
revoke execute on function public.reports_up_to(uuid, uuid) from public, anon, authenticated;

-- Replace a person's additional line managers.
create or replace function public.set_additional_line_managers(p_org uuid, p_employee uuid, p_manager_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.employees;
  v_mgr uuid;
  v_n integer := 0;
begin
  if not (public.has_permission(p_org, 'staff.manage') or public.has_permission(p_org, 'departments.manage') or public.is_org_admin(p_org)) then
    raise exception 'Only HR or the Managing Partner can set line managers' using errcode = '42501';
  end if;
  select * into e from public.employees where id = p_employee and organization_id = p_org;
  if not found then raise exception 'Employee not found'; end if;

  delete from public.employee_line_managers where employee_id = e.id;
  foreach v_mgr in array coalesce(p_manager_ids, '{}') loop
    continue when v_mgr is null or v_mgr = e.manager_employee_id;
    if v_mgr = e.id then raise exception 'Someone cannot be their own line manager'; end if;
    if not exists (select 1 from public.employees where id = v_mgr and organization_id = p_org) then
      raise exception 'Line manager not found';
    end if;
    if public.reports_up_to(v_mgr, e.id) then
      raise exception 'That would create a reporting loop — % already reports (directly or indirectly) to %',
        (select trim(first_name || ' ' || last_name) from public.employees where id = v_mgr), trim(e.first_name || ' ' || e.last_name);
    end if;
    insert into public.employee_line_managers (organization_id, employee_id, manager_employee_id) values (p_org, e.id, v_mgr)
    on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  perform public.log_audit(p_org, 'employees.additional_line_managers_set', 'employee', e.id,
    trim(e.first_name || ' ' || e.last_name) || ' now also reports to ' || v_n || ' other line manager' || case when v_n = 1 then '' else 's' end,
    jsonb_build_object('managers', p_manager_ids));
  return v_n;
end;
$$;
grant execute on function public.set_additional_line_managers(uuid, uuid, uuid[]) to authenticated;

-- Making someone the primary line manager removes them from the additional
-- list; a primary change that would close a loop through an additional line
-- is refused.
create or replace function public.employees_primary_manager_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.manager_employee_id is not null and new.manager_employee_id is distinct from old.manager_employee_id then
    delete from public.employee_line_managers where employee_id = new.id and manager_employee_id = new.manager_employee_id;
    if public.reports_up_to(new.manager_employee_id, new.id) then
      raise exception 'That would create a reporting loop — the new line manager already reports (directly or indirectly) to this person';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_employees_primary_manager_check on public.employees;
create trigger trg_employees_primary_manager_check before update of manager_employee_id on public.employees
  for each row execute function public.employees_primary_manager_check();

-- "My team": everyone who reports to me, through any line.
drop function if exists public.my_direct_reports(uuid);
create function public.my_direct_reports(p_org uuid)
returns table (employee_id uuid, user_id uuid, full_name text, is_primary boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.user_id, trim(e.first_name || ' ' || e.last_name), bool_or(x.is_primary)
  from public.employees e
  join (
    select e2.id, true as is_primary from public.employees e2 join public.employees me on me.id = e2.manager_employee_id
     where e2.organization_id = p_org and me.user_id = auth.uid()
    union all
    select lm.employee_id, false from public.employee_line_managers lm join public.employees me on me.id = lm.manager_employee_id
     where lm.organization_id = p_org and me.user_id = auth.uid()
  ) x on x.id = e.id
  where e.organization_id = p_org and e.employment_status not in ('resigned', 'terminated', 'former_employee')
  group by e.id, e.user_id, e.first_name, e.last_name;
$$;
grant execute on function public.my_direct_reports(uuid) to authenticated;

-- RLS: any line manager sees the person's leave and inventory requests.
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'leave.manage') and public.user_has_branch_access(organization_id, public.employee_branch(organization_id, user_id)))
    or public.is_line_manager_of(organization_id, user_id, auth.uid())
  );
drop policy if exists inventory_requests_select on public.inventory_requests;
create policy inventory_requests_select on public.inventory_requests
  for select using (
    user_id = auth.uid()
    or public.is_inventory_manager(organization_id, branch_id)
    or public.is_line_manager_of(organization_id, user_id, auth.uid())
  );

-- Fund endorsement: any of the requester's line managers may endorse.
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
  -- Any of the requester's line managers endorses their team member's request.
  if a.approver_type = 'line_manager' and (a.approver_id = p_user or public.is_line_manager_of(fr.organization_id, fr.user_id, p_user)) then
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
-- Existing functions: "the line manager" -> "any line manager" (bodies otherwise unchanged).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_inventory_request(p_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS inventory_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rec public.inventory_requests;
begin
  select * into rec from public.inventory_requests where id = p_id for update;
  if rec.id is null then raise exception 'Request not found'; end if;
  if rec.user_id = auth.uid() then raise exception 'You cannot approve your own request'; end if;
  if rec.status <> 'pending' then raise exception 'This request has already been %', rec.status; end if;
  if not public.is_line_manager_of(rec.organization_id, rec.user_id, auth.uid())
     and not public.approval_allows(rec.organization_id, 'inventory', auth.uid(), rec.branch_id, rec.user_id) then
    raise exception 'Not permitted — the requester''s line manager or an inventory manager approves' using errcode = '42501';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'Give a reason'; end if;
  update public.inventory_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_id returning * into rec;
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'inventory.decided', 'inventory_request', rec.id,
    'Your request for ' || rec.item_name || case when p_approve then ' was approved' else ' was declined: ' || trim(p_note) end, 'info');
  if p_approve then
    perform public.notify_inventory_managers(rec.organization_id, rec.branch_id, auth.uid(), 'inventory.to_issue', 'inventory_request', rec.id,
      'Approved — please issue ' || rec.item_name || ' ×' || rec.quantity);
  end if;
  return rec;
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
  if not public.is_line_manager_of(rec.organization_id, rec.user_id, auth.uid()) then
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

CREATE OR REPLACE FUNCTION public.request_inventory(p_org uuid, p_item uuid, p_item_name text, p_quantity numeric, p_reason text DEFAULT NULL::text)
 RETURNS inventory_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec public.inventory_requests;
  it public.inventory_items;
  v_branch uuid := public.employee_branch(p_org, auth.uid());
  v_mgr uuid := public.line_manager_user(p_org, auth.uid());
begin
  if not public.is_org_member(p_org) then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if p_item is not null then
    select * into it from public.inventory_items where id = p_item and organization_id = p_org;
    if it.id is null then raise exception 'Item not found'; end if;
    v_branch := coalesce(it.branch_id, v_branch);
  end if;
  if coalesce(trim(coalesce(p_item_name, it.name)), '') = '' then
    raise exception 'Say what you need';
  end if;
  insert into public.inventory_requests (organization_id, branch_id, user_id, item_id, item_name, quantity, reason)
  values (p_org, v_branch, auth.uid(), p_item, coalesce(nullif(trim(p_item_name), ''), it.name), coalesce(p_quantity, 1), nullif(trim(coalesce(p_reason, '')), ''))
  returning * into rec;
  if v_mgr is not null then
    perform public.notify_user(p_org, lm.u, auth.uid(), 'hr', 'inventory.requested', 'inventory_request', rec.id,
      'A team member asked for ' || rec.item_name || ' — please approve', 'info')
    from public.line_manager_users(p_org, auth.uid()) lm(u);
  else
    perform public.notify_inventory_managers(p_org, v_branch, auth.uid(), 'inventory.requested', 'inventory_request', rec.id,
      'Request for ' || rec.item_name || ' needs approval');
  end if;
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
    and not public.is_line_manager_of(p_org, auth.uid(), m.user_id);

  -- The line manager approves their team's leave.
  if public.line_manager_user(p_org, auth.uid()) is not null then
    perform public.notify_user(p_org, lm.u, auth.uid(), 'hr', 'leave.requested',
      'leave_request', rec.id, 'A team member''s leave request needs your approval', 'info')
    from public.line_manager_users(p_org, auth.uid()) lm(u);
  end if;

  return rec;
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_approval_escalations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      perform public.notify_user(r.organization_id, lm.u, null, 'hr', 'leave.reminder', 'leave_request', r.id,
        'Reminder: ' || r.who || '''s leave request is waiting for you', 'info')
      from public.line_manager_users(r.organization_id, r.user_id) lm(u);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$function$;

