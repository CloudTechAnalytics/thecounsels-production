-- ============================================================================
-- Migration 0176 — HR & Finance, Phase 1.
--
-- A. Employee register (public.employees): every person the firm employs,
--    with or without a login. Login users are linked by user_id and kept in
--    sync with staff_profiles in both directions, so every existing screen
--    that reads staff_profiles keeps working. A login created later with the
--    same email links to the existing employee instead of duplicating it.
-- B. Payroll keyed by employee, not login (0175 tables re-keyed), so staff
--    without accounts can be paid. Bank details stay on employee_salaries —
--    payroll-only visibility, never on the general register.
-- C. Configurable approval engine for fund requests: firm-defined workflows
--    matched on amount / category / department / branch, sequential steps
--    (steps sharing a number run in parallel), approvers by line manager,
--    department head, role(s), permission or a named person, delegation,
--    self-approval only where a firm explicitly allows it, drafts, return
--    for clarification (with numbered rounds kept for history), partial
--    approval (approver lowers the amount), attachments, and payment detail.
--    Firms with no workflow keep the 0174 default chain.
-- ============================================================================

-- ===========================================================================
-- A. Employee register
-- ===========================================================================
create table public.employee_counters (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  last_value      integer not null default 0
);
alter table public.employee_counters enable row level security;

create table public.employees (
  id                              uuid primary key default gen_random_uuid(),
  organization_id                 uuid not null references public.organizations(id) on delete cascade,
  employee_number                 text not null,
  user_id                         uuid references public.profiles(id) on delete set null,
  first_name                      text not null,
  last_name                       text not null default '',
  email                           citext,
  phone                           text,
  photo_url                       text,
  department_id                   uuid references public.departments(id) on delete set null,
  job_title_id                    uuid references public.job_titles(id) on delete set null,
  branch_id                       uuid references public.branches(id) on delete set null,
  manager_employee_id             uuid references public.employees(id) on delete set null,
  employment_type                 text not null default 'full_time',
  employment_status               text not null default 'active',
  start_date                      date,
  end_date                        date,
  date_of_birth                   date,
  address                         text,
  emergency_contact_name          text,
  emergency_contact_phone         text,
  emergency_contact_relationship  text,
  notes                           text,
  created_by                      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  unique (organization_id, employee_number),
  unique (organization_id, user_id),
  check (manager_employee_id is null or manager_employee_id <> id)
);
create index idx_employees_org_status on public.employees (organization_id, employment_status);
create index idx_employees_org_email on public.employees (organization_id, email);

create or replace function public.next_employee_number(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_num text;
begin
  loop
    insert into public.employee_counters (organization_id, last_value) values (p_org, 1)
    on conflict (organization_id) do update set last_value = public.employee_counters.last_value + 1
    returning last_value into v_n;
    v_num := 'EMP-' || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from public.employees where organization_id = p_org and employee_number = v_num);
  end loop;
  return v_num;
end;
$$;
revoke execute on function public.next_employee_number(uuid) from public, anon, authenticated;

create or replace function public.employees_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and coalesce(new.employee_number, '') = '' then
    new.employee_number := public.next_employee_number(new.organization_id);
  end if;
  if tg_op = 'UPDATE' then
    new.employee_number := old.employee_number;   -- the number never changes once issued
    new.organization_id := old.organization_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_employees_before_write
  before insert or update on public.employees
  for each row execute function public.employees_before_write();

-- Backfill: one employee per current member (active or suspended).
with src as (
  select m.organization_id, m.user_id, p.full_name, p.email::text as email, p.avatar_url,
         sp.phone, sp.department_id, sp.job_title_id, sp.branch_id,
         coalesce(sp.employment_type, 'full_time') as employment_type,
         coalesce(sp.employment_status, 'active') as employment_status,
         sp.start_date, sp.end_date, sp.date_of_birth, sp.address,
         sp.emergency_contact_name, sp.emergency_contact_phone,
         nullif(trim(sp.employee_code), '') as code,
         m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  left join public.staff_profiles sp on sp.organization_id = m.organization_id and sp.user_id = m.user_id
  where m.status in ('active', 'suspended')
), coded as (
  select src.*,
         count(*) over (partition by organization_id, code) as code_uses
  from src
)
insert into public.employees (
  organization_id, user_id, employee_number, first_name, last_name, email, phone, photo_url,
  department_id, job_title_id, branch_id, employment_type, employment_status,
  start_date, end_date, date_of_birth, address, emergency_contact_name, emergency_contact_phone, created_by
)
select c.organization_id, c.user_id,
       case when c.code is not null and c.code_uses = 1 then c.code else '' end,
       coalesce(nullif(split_part(trim(coalesce(c.full_name, '')), ' ', 1), ''), split_part(c.email, '@', 1), 'Employee'),
       coalesce(nullif(trim(substr(trim(coalesce(c.full_name, '')), length(split_part(trim(coalesce(c.full_name, '')), ' ', 1)) + 1)), ''), ''),
       c.email, c.phone, c.avatar_url,
       c.department_id, c.job_title_id, c.branch_id, c.employment_type, c.employment_status,
       c.start_date, c.end_date, c.date_of_birth, c.address, c.emergency_contact_name, c.emergency_contact_phone, null
from coded c
order by c.organization_id, c.created_at
on conflict (organization_id, user_id) do nothing;

update public.employees e
set manager_employee_id = mgr.id
from public.staff_profiles sp
join public.employees mgr on mgr.organization_id = sp.organization_id and mgr.user_id = sp.manager_id
where sp.organization_id = e.organization_id and sp.user_id = e.user_id
  and sp.manager_id is not null and mgr.id <> e.id;

-- Sync employees -> staff_profiles for linked employees. pg_trigger_depth()
-- guards stop the two sync triggers from bouncing off each other.
create or replace function public.sync_employee_to_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager_user uuid;
begin
  if new.user_id is null or pg_trigger_depth() > 1 then
    return new;
  end if;
  select user_id into v_manager_user from public.employees where id = new.manager_employee_id;
  insert into public.staff_profiles (
    organization_id, user_id, employee_code, department_id, job_title_id, branch_id, manager_id,
    employment_type, employment_status, start_date, end_date, date_of_birth, address, phone,
    emergency_contact_name, emergency_contact_phone
  ) values (
    new.organization_id, new.user_id, new.employee_number, new.department_id, new.job_title_id, new.branch_id, v_manager_user,
    new.employment_type, new.employment_status, new.start_date, new.end_date, new.date_of_birth, new.address, new.phone,
    new.emergency_contact_name, new.emergency_contact_phone
  )
  on conflict (organization_id, user_id) do update set
    employee_code = excluded.employee_code, department_id = excluded.department_id, job_title_id = excluded.job_title_id,
    branch_id = excluded.branch_id, manager_id = excluded.manager_id, employment_type = excluded.employment_type,
    employment_status = excluded.employment_status, start_date = excluded.start_date, end_date = excluded.end_date,
    date_of_birth = excluded.date_of_birth, address = excluded.address, phone = excluded.phone,
    emergency_contact_name = excluded.emergency_contact_name, emergency_contact_phone = excluded.emergency_contact_phone,
    updated_at = now();
  return new;
end;
$$;
create trigger trg_sync_employee_to_staff_profile
  after insert or update on public.employees
  for each row execute function public.sync_employee_to_staff_profile();

-- Sync staff_profiles -> employees (edits made through the existing
-- profile screens, including an employee editing their own phone/address).
create or replace function public.sync_staff_profile_to_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  update public.employees e set
    department_id = new.department_id, job_title_id = new.job_title_id, branch_id = new.branch_id,
    manager_employee_id = coalesce((select m.id from public.employees m where m.organization_id = new.organization_id and m.user_id = new.manager_id and m.id <> e.id), case when new.manager_id is null then null else e.manager_employee_id end),
    employment_type = coalesce(new.employment_type, e.employment_type),
    employment_status = coalesce(new.employment_status, e.employment_status),
    start_date = new.start_date, end_date = new.end_date, date_of_birth = new.date_of_birth,
    address = new.address, phone = new.phone,
    emergency_contact_name = new.emergency_contact_name, emergency_contact_phone = new.emergency_contact_phone
  where e.organization_id = new.organization_id and e.user_id = new.user_id;
  return new;
end;
$$;
create trigger trg_sync_staff_profile_to_employee
  after insert or update on public.staff_profiles
  for each row execute function public.sync_staff_profile_to_employee();

-- New or reactivated member -> make sure they're on the register, linking
-- to an existing no-login employee with the same email when there is one.
create or replace function public.ensure_employee_for_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_existing uuid;
begin
  if new.status not in ('active', 'suspended') then
    return new;
  end if;
  if exists (select 1 from public.employees where organization_id = new.organization_id and user_id = new.user_id) then
    return new;
  end if;
  select * into v_profile from public.profiles where id = new.user_id;
  select id into v_existing from public.employees
  where organization_id = new.organization_id and user_id is null and email is not null and email = v_profile.email::citext
  order by created_at limit 1;
  if v_existing is not null then
    update public.employees set user_id = new.user_id where id = v_existing;
  else
    insert into public.employees (organization_id, user_id, employee_number, first_name, last_name, email, photo_url, created_by)
    values (
      new.organization_id, new.user_id, '',
      coalesce(nullif(split_part(trim(coalesce(v_profile.full_name, '')), ' ', 1), ''), split_part(v_profile.email::text, '@', 1), 'Employee'),
      coalesce(nullif(trim(substr(trim(coalesce(v_profile.full_name, '')), length(split_part(trim(coalesce(v_profile.full_name, '')), ' ', 1)) + 1)), ''), ''),
      v_profile.email, v_profile.avatar_url, null
    );
  end if;
  return new;
end;
$$;
create trigger trg_ensure_employee_for_member
  after insert or update of status on public.memberships
  for each row execute function public.ensure_employee_for_member();

alter table public.employees enable row level security;
create policy "employees_select" on public.employees
  for select using (
    user_id = auth.uid()
    or public.has_permission(organization_id, 'staff.view')
    or public.has_permission(organization_id, 'staff.manage')
    or public.has_permission(organization_id, 'payroll.manage')
    or public.has_permission(organization_id, 'funds.manage')
  );
create policy "employees_insert" on public.employees
  for insert with check (public.has_permission(organization_id, 'staff.manage') and public.org_has_feature(organization_id, 'hr_module'));
create policy "employees_update" on public.employees
  for update using (public.has_permission(organization_id, 'staff.manage'))
  with check (public.has_permission(organization_id, 'staff.manage'));
-- Only a register-only entry (never linked to a login, no payroll history)
-- can be deleted; everyone else is deactivated via employment_status.
create policy "employees_delete" on public.employees
  for delete using (public.has_permission(organization_id, 'staff.manage') and user_id is null);

-- Department heads, for the "department head" approval step.
alter table public.departments add column if not exists head_employee_id uuid references public.employees(id) on delete set null;

-- ===========================================================================
-- B. Payroll keyed by employee
-- ===========================================================================
alter table public.employee_salaries add column if not exists employee_id uuid references public.employees(id) on delete cascade;
update public.employee_salaries s set employee_id = e.id
from public.employees e where e.organization_id = s.organization_id and e.user_id = s.user_id and s.employee_id is null;
delete from public.employee_salaries where employee_id is null;
drop policy if exists "employee_salaries_select" on public.employee_salaries;
alter table public.employee_salaries drop constraint employee_salaries_pkey;
alter table public.employee_salaries drop column user_id;
alter table public.employee_salaries alter column employee_id set not null;
alter table public.employee_salaries add primary key (organization_id, employee_id);
create policy "employee_salaries_select" on public.employee_salaries
  for select using (
    public.has_permission(organization_id, 'payroll.manage')
    or (
      public.has_permission(organization_id, 'payroll.view_own')
      and exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    )
  );

alter table public.payslips add column if not exists employee_id uuid references public.employees(id) on delete restrict;
update public.payslips ps set employee_id = e.id
from public.employees e where e.organization_id = ps.organization_id and e.user_id = ps.user_id and ps.employee_id is null;
delete from public.payslips where employee_id is null;
alter table public.payslips alter column employee_id set not null;
alter table public.payslips alter column user_id drop not null;
alter table public.payslips drop constraint if exists payslips_run_id_user_id_key;
alter table public.payslips add constraint payslips_run_id_employee_id_key unique (run_id, employee_id);
alter table public.payslips add column if not exists employee_number text;

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

-- ===========================================================================
-- C. Approval engine for fund requests
-- ===========================================================================
alter table public.fund_settings add column if not exists allow_self_approval boolean not null default false;

create table public.approval_workflows (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  module               text not null default 'fund_request' check (module in ('fund_request')),
  name                 text not null,
  priority             integer not null default 100,
  is_active            boolean not null default true,
  min_amount           numeric(14,2) check (min_amount is null or min_amount >= 0),
  max_amount           numeric(14,2) check (max_amount is null or max_amount >= 0),
  categories           text[] not null default '{}',
  department_ids       uuid[] not null default '{}',
  branch_ids           uuid[] not null default '{}',
  allow_self_approval  boolean not null default false,
  created_by           uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (min_amount is null or max_amount is null or max_amount >= min_amount)
);
create index idx_approval_workflows_org on public.approval_workflows (organization_id, module, is_active, priority);

create table public.approval_workflow_steps (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  workflow_id       uuid not null references public.approval_workflows(id) on delete cascade,
  step_order        integer not null check (step_order >= 1),
  name              text not null,
  approver_type     text not null check (approver_type in ('line_manager', 'department_head', 'role', 'permission', 'specific_user')),
  -- role: comma-separated role keys; permission: a permission key.
  approver_value    text,
  approver_user_id  uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  check (approver_type not in ('role', 'permission') or coalesce(approver_value, '') <> ''),
  check (approver_type <> 'specific_user' or approver_user_id is not null)
);
create index idx_approval_workflow_steps_wf on public.approval_workflow_steps (workflow_id, step_order);

create table public.approval_delegations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  delegator_user_id  uuid not null references public.profiles(id) on delete cascade,
  delegate_user_id   uuid not null references public.profiles(id) on delete cascade,
  starts_on          date not null default current_date,
  ends_on            date not null,
  reason             text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (delegator_user_id <> delegate_user_id)
);
create index idx_approval_delegations_delegate on public.approval_delegations (organization_id, delegate_user_id, is_active);

alter table public.approval_workflows enable row level security;
create policy "approval_workflows_select" on public.approval_workflows
  for select using (public.has_permission(organization_id, 'funds.request') or public.has_permission(organization_id, 'funds.manage'));
create policy "approval_workflows_write" on public.approval_workflows
  for all using (public.has_permission(organization_id, 'funds.manage'))
  with check (public.has_permission(organization_id, 'funds.manage') and public.org_has_feature(organization_id, 'hr_module'));

alter table public.approval_workflow_steps enable row level security;
create policy "approval_workflow_steps_select" on public.approval_workflow_steps
  for select using (public.has_permission(organization_id, 'funds.request') or public.has_permission(organization_id, 'funds.manage'));
create policy "approval_workflow_steps_write" on public.approval_workflow_steps
  for all using (public.has_permission(organization_id, 'funds.manage'))
  with check (public.has_permission(organization_id, 'funds.manage'));

alter table public.approval_delegations enable row level security;
create policy "approval_delegations_select" on public.approval_delegations
  for select using (
    delegator_user_id = auth.uid() or delegate_user_id = auth.uid()
    or public.has_permission(organization_id, 'funds.manage')
  );
create policy "approval_delegations_insert" on public.approval_delegations
  for insert with check (
    public.is_org_member(organization_id)
    and (delegator_user_id = auth.uid() or public.has_permission(organization_id, 'funds.manage'))
    and exists (select 1 from public.memberships m where m.organization_id = approval_delegations.organization_id and m.user_id = delegate_user_id and m.status = 'active')
  );
create policy "approval_delegations_update" on public.approval_delegations
  for update using (delegator_user_id = auth.uid() or public.has_permission(organization_id, 'funds.manage'))
  with check (delegator_user_id = auth.uid() or public.has_permission(organization_id, 'funds.manage'));
create policy "approval_delegations_delete" on public.approval_delegations
  for delete using (delegator_user_id = auth.uid() or public.has_permission(organization_id, 'funds.manage'));

-- fund_requests: drafts, clarification, partial approval, payment detail.
alter table public.fund_requests drop constraint if exists fund_requests_status_check;
alter table public.fund_requests add constraint fund_requests_status_check check (status in (
  'draft', 'pending', 'returned', 'approved', 'rejected', 'cancelled',
  'payment_processing', 'disbursed', 'retirement_submitted', 'retired'
));
alter table public.fund_requests drop constraint if exists fund_requests_category_check;
alter table public.fund_requests
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists approved_amount numeric(14,2),
  add column if not exists workflow_id uuid references public.approval_workflows(id) on delete set null,
  add column if not exists current_round integer not null default 1,
  add column if not exists submitted_at timestamptz,
  add column if not exists payment_date date,
  add column if not exists disbursement_notes text;
alter table public.fund_requests alter column request_number drop not null;
update public.fund_requests fr set
  employee_id = e.id, department_id = e.department_id, branch_id = e.branch_id,
  submitted_at = coalesce(fr.submitted_at, fr.created_at),
  approved_amount = case when fr.status in ('approved', 'disbursed', 'retirement_submitted', 'retired') then coalesce(fr.approved_amount, fr.amount) else fr.approved_amount end
from public.employees e
where e.organization_id = fr.organization_id and e.user_id = fr.user_id;

alter table public.fund_request_approvals drop constraint if exists fund_request_approvals_stage_check;
alter table public.fund_request_approvals drop constraint if exists fund_request_approvals_status_check;
alter table public.fund_request_approvals add constraint fund_request_approvals_status_check
  check (status in ('waiting', 'pending', 'approved', 'rejected', 'returned', 'skipped'));
alter table public.fund_request_approvals drop constraint if exists fund_request_approvals_request_id_step_key;
alter table public.fund_request_approvals
  add column if not exists round integer not null default 1,
  add column if not exists approver_type text,
  add column if not exists approver_value text,
  add column if not exists step_name text,
  add column if not exists acted_as_delegate_for uuid references public.profiles(id) on delete set null,
  add column if not exists approved_amount numeric(14,2);
update public.fund_request_approvals set
  approver_type = coalesce(approver_type, case stage when 'line_manager' then 'line_manager' when 'approver' then 'permission' else 'role' end),
  approver_value = coalesce(approver_value, case stage when 'approver' then 'funds.approve' when 'leadership' then 'managing_partner,partner' else null end),
  step_name = coalesce(step_name, case stage when 'line_manager' then 'Line manager' when 'approver' then 'Finance approval' else 'Partner approval' end);
create index if not exists idx_fund_request_approvals_req on public.fund_request_approvals (request_id, round, step);

create table public.fund_request_attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null references public.fund_requests(id) on delete cascade,
  kind            text not null default 'supporting' check (kind in ('supporting', 'payment_proof')),
  file_name       text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index idx_fund_request_attachments_req on public.fund_request_attachments (request_id);

-- ---------------------------------------------------------------------------
-- Eligibility
-- ---------------------------------------------------------------------------
create or replace function public.fund_self_approval_allowed(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select w.allow_self_approval from public.fund_requests fr join public.approval_workflows w on w.id = fr.workflow_id where fr.id = p_request),
    (select s.allow_self_approval from public.fund_requests fr join public.fund_settings s on s.organization_id = fr.organization_id where fr.id = p_request),
    false
  );
$$;
revoke execute on function public.fund_self_approval_allowed(uuid) from public, anon, authenticated;

-- Could this user act on this approval row in their own right?
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
  if a.id is null or p_user is null then return false; end if;
  if not exists (select 1 from public.memberships where organization_id = fr.organization_id and user_id = p_user and status = 'active') then
    return false;
  end if;
  if fr.user_id = p_user and not public.fund_self_approval_allowed(fr.id) then
    return false;
  end if;
  return case a.approver_type
    when 'line_manager' then a.approver_id = p_user
    when 'department_head' then a.approver_id = p_user
    when 'specific_user' then a.approver_id = p_user
    when 'role' then public.member_role_key(fr.organization_id, p_user) = any (string_to_array(replace(coalesce(a.approver_value, ''), ' ', ''), ','))
    when 'permission' then public.member_has_permission(fr.organization_id, p_user, a.approver_value)
    else false
  end;
end;
$$;
revoke execute on function public.fund_step_direct(uuid, uuid) from public, anon, authenticated;

-- Returns who the user is acting for: themselves, or the delegator whose
-- authority they hold today. Null when they can't act on this row.
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
  if public.fund_step_direct(p_approval, p_user) then
    return p_user;
  end if;
  select fr.organization_id, fr.user_id into v_org, v_requester
  from public.fund_request_approvals a join public.fund_requests fr on fr.id = a.request_id where a.id = p_approval;
  if v_requester = p_user and not public.fund_self_approval_allowed((select request_id from public.fund_request_approvals where id = p_approval)) then
    return null;
  end if;
  select d.delegator_user_id into v_for
  from public.approval_delegations d
  where d.organization_id = v_org and d.delegate_user_id = p_user and d.is_active
    and current_date between d.starts_on and d.ends_on
    and public.fund_step_direct(p_approval, d.delegator_user_id)
  limit 1;
  return v_for;
end;
$$;
revoke execute on function public.fund_step_acting_for(uuid, uuid) from public, anon, authenticated;

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
          public.has_permission(fr.organization_id, 'funds.approve')
          or public.has_permission(fr.organization_id, 'funds.manage')
          or public.member_role_key(fr.organization_id, auth.uid()) in ('managing_partner', 'partner')
          or exists (
            select 1 from public.fund_request_approvals a
            where a.request_id = fr.id
              and (a.approver_id = auth.uid() or a.acted_by = auth.uid() or public.fund_step_acting_for(a.id, auth.uid()) is not null)
          )
        ))
      )
  );
$$;

-- Requester may manage supporting attachments until a decision is final.
create or replace function public.can_edit_fund_request(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request and fr.user_id = auth.uid() and fr.status in ('draft', 'returned', 'pending')
  );
$$;
grant execute on function public.can_edit_fund_request(uuid) to authenticated;

alter table public.fund_request_attachments enable row level security;
create policy "fund_request_attachments_select" on public.fund_request_attachments
  for select using (public.can_view_fund_request(request_id));
create policy "fund_request_attachments_insert" on public.fund_request_attachments
  for insert with check (
    (kind = 'supporting' and public.can_edit_fund_request(request_id))
    or (kind = 'payment_proof' and public.has_permission(organization_id, 'funds.manage'))
  );
create policy "fund_request_attachments_delete" on public.fund_request_attachments
  for delete using (
    (kind = 'supporting' and public.can_edit_fund_request(request_id))
    or (kind = 'payment_proof' and public.has_permission(organization_id, 'funds.manage'))
  );

-- Storage: {org}/{request}/attachments/... and {org}/{request}/payment/...
create policy "fund_attachments_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'fund-receipts' and (
      ((storage.foldername(name))[3] = 'attachments' and public.can_edit_fund_request(((storage.foldername(name))[2])::uuid))
      or ((storage.foldername(name))[3] = 'payment' and public.has_permission(((storage.foldername(name))[1])::uuid, 'funds.manage'))
    )
  );
create policy "fund_attachments_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'fund-receipts' and (
      ((storage.foldername(name))[3] = 'attachments' and public.can_edit_fund_request(((storage.foldername(name))[2])::uuid))
      or ((storage.foldername(name))[3] = 'payment' and public.has_permission(((storage.foldername(name))[1])::uuid, 'funds.manage'))
    )
  );

-- ---------------------------------------------------------------------------
-- Chain building and progression
-- ---------------------------------------------------------------------------
create or replace function public.notify_fund_step(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fr public.fund_requests;
  a record;
  v_title text;
begin
  select * into fr from public.fund_requests where id = p_request;
  v_title := 'Fund request ' || fr.request_number || ' needs your approval';
  for a in select id from public.fund_request_approvals where request_id = p_request and round = fr.current_round and status = 'pending' loop
    perform public.notify_user(fr.organization_id, m.user_id, auth.uid(), 'hr', 'funds.approval_needed',
      'fund_request', fr.id, v_title, 'info')
    from public.memberships m
    where m.organization_id = fr.organization_id and m.status = 'active'
      and m.user_id is distinct from auth.uid()
      and public.fund_step_acting_for(a.id, m.user_id) is not null;
  end loop;
end;
$$;
revoke execute on function public.notify_fund_step(uuid) from public, anon, authenticated;

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
    return p_user;
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
  if v is not null and not exists (select 1 from public.memberships where organization_id = fr.organization_id and user_id = v and status = 'active') then
    return null;
  end if;
  return v;
end;
$$;
revoke execute on function public.fund_resolve_person(uuid, text, uuid) from public, anon, authenticated;

-- Builds a new approval round for the request and opens its first step.
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
      v_person := case when st.approver_type in ('line_manager', 'department_head', 'specific_user')
                       then public.fund_resolve_person(fr.id, st.approver_type, st.approver_user_id) end;
      insert into public.fund_request_approvals (organization_id, request_id, round, step, stage, step_name, approver_type, approver_value, approver_id, status, comment)
      values (fr.organization_id, fr.id, fr.current_round, st.step_order, st.approver_type, st.name, st.approver_type, st.approver_value, v_person,
              case when st.approver_type in ('line_manager', 'department_head', 'specific_user') and v_person is null then 'skipped' else 'waiting' end,
              case when st.approver_type in ('line_manager', 'department_head', 'specific_user') and v_person is null
                   then 'Skipped — no ' || replace(st.approver_type, '_', ' ') || ' is set for this employee' end);
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

  -- A workflow whose every person-step resolved to nobody still needs a
  -- decision-maker: fall back to whoever holds funds.approve.
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

-- Create or edit a draft (or a request returned for clarification), and
-- optionally submit it.
create or replace function public.save_fund_request(
  p_org uuid,
  p_title text,
  p_category text,
  p_amount numeric,
  p_request uuid default null,
  p_needed_by date default null,
  p_matter uuid default null,
  p_client uuid default null,
  p_purpose text default null,
  p_submit boolean default true
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  emp public.employees;
  v_seq integer;
  v_year integer := extract(year from now())::int;
  v_resubmit boolean := false;
begin
  if not public.has_permission(p_org, 'funds.request') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if not public.org_has_feature(p_org, 'hr_module') then
    raise exception 'Fund requests are part of HR & People Management, which is not included in your plan. Upgrade to Business to use it.';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Give the request a title';
  end if;
  if coalesce(trim(p_category), '') = '' then
    raise exception 'Choose a category';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_matter is not null and not exists (select 1 from public.matters where id = p_matter and organization_id = p_org) then
    raise exception 'Matter not found';
  end if;
  if p_client is not null and not exists (select 1 from public.clients where id = p_client and organization_id = p_org) then
    raise exception 'Client not found';
  end if;

  select * into emp from public.employees where organization_id = p_org and user_id = auth.uid();

  if p_request is null then
    insert into public.fund_requests (organization_id, user_id, employee_id, department_id, branch_id, title, category, purpose, amount, needed_by, matter_id, client_id, status)
    values (p_org, auth.uid(), emp.id, emp.department_id, emp.branch_id, trim(p_title), p_category,
            nullif(trim(coalesce(p_purpose, '')), ''), round(p_amount, 2), p_needed_by, p_matter, p_client, 'draft')
    returning * into rec;
  else
    select * into rec from public.fund_requests where id = p_request and organization_id = p_org for update;
    if rec.id is null or rec.user_id <> auth.uid() then
      raise exception 'Fund request not found';
    end if;
    if rec.status not in ('draft', 'returned') then
      raise exception 'Only drafts and requests returned for clarification can be edited';
    end if;
    v_resubmit := rec.status = 'returned';
    update public.fund_requests set
      title = trim(p_title), category = p_category, purpose = nullif(trim(coalesce(p_purpose, '')), ''),
      amount = round(p_amount, 2), needed_by = p_needed_by, matter_id = p_matter, client_id = p_client,
      employee_id = coalesce(employee_id, emp.id), department_id = coalesce(emp.department_id, department_id),
      branch_id = coalesce(emp.branch_id, branch_id), updated_at = now()
    where id = rec.id returning * into rec;
  end if;

  if not p_submit then
    return rec;
  end if;

  if rec.request_number is null then
    insert into public.fund_request_counters (organization_id, year, last_value)
    values (p_org, v_year, 1)
    on conflict (organization_id, year) do update set last_value = public.fund_request_counters.last_value + 1
    returning last_value into v_seq;
    update public.fund_requests set request_number = 'FR-' || v_year || '-' || lpad(v_seq::text, 4, '0') where id = rec.id;
  end if;

  update public.fund_requests set
    status = 'pending', submitted_at = now(), approved_amount = null,
    current_round = case when v_resubmit then current_round + 1 else current_round end,
    updated_at = now()
  where id = rec.id returning * into rec;

  perform public.build_fund_chain(rec.id);
  select * into rec from public.fund_requests where id = rec.id;

  perform public.log_audit(p_org, case when v_resubmit then 'funds.resubmitted' else 'funds.requested' end, 'fund_request', rec.id,
    'Fund request ' || rec.request_number || case when v_resubmit then ' resubmitted' else ' submitted' end,
    jsonb_build_object('amount', rec.amount, 'category', rec.category, 'workflow_id', rec.workflow_id, 'round', rec.current_round));
  perform public.notify_fund_step(rec.id);
  return rec;
end;
$$;

-- Kept for callers built against 0174.
create or replace function public.submit_fund_request(
  p_org uuid, p_title text, p_category text, p_amount numeric,
  p_needed_by date default null, p_matter uuid default null, p_purpose text default null
)
returns public.fund_requests
language sql
security definer
set search_path = public
as $$
  select public.save_fund_request(p_org, p_title, p_category, p_amount, null, p_needed_by, p_matter, null, p_purpose, true);
$$;

create or replace function public.delete_fund_draft(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.fund_requests where id = p_request and user_id = auth.uid() and status = 'draft' and request_number is null;
  if not found then
    raise exception 'Only your own unsent drafts can be deleted';
  end if;
end;
$$;

-- approve | reject | return. p_amount lets an approver approve less than asked.
create or replace function public.decide_fund_request(
  p_request uuid,
  p_decision text,
  p_comment text default null,
  p_amount numeric default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  st public.fund_request_approvals;
  v_for uuid;
  v_next integer;
  v_ceiling numeric(14,2);
begin
  if p_decision not in ('approve', 'reject', 'return') then
    raise exception 'Unknown decision';
  end if;
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if rec.status <> 'pending' then
    raise exception 'This request is no longer awaiting approval';
  end if;

  for st in
    select * from public.fund_request_approvals
    where request_id = rec.id and round = rec.current_round and status = 'pending'
    order by step, id
  loop
    v_for := public.fund_step_acting_for(st.id, auth.uid());
    exit when v_for is not null;
  end loop;
  if v_for is null then
    raise exception 'You are not an approver for this request' using errcode = '42501';
  end if;
  if p_decision in ('reject', 'return') and coalesce(trim(p_comment), '') = '' then
    raise exception 'Give a reason';
  end if;

  v_ceiling := coalesce(rec.approved_amount, rec.amount);
  if p_decision = 'approve' and p_amount is not null and (p_amount <= 0 or p_amount > v_ceiling) then
    raise exception 'Approved amount must be between ₦1 and %', v_ceiling;
  end if;

  update public.fund_request_approvals set
    status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
    acted_by = auth.uid(), acted_at = now(),
    acted_as_delegate_for = case when v_for <> auth.uid() then v_for end,
    approved_amount = case when p_decision = 'approve' then coalesce(round(p_amount, 2), v_ceiling) end,
    comment = nullif(trim(coalesce(p_comment, '')), '')
  where id = st.id;

  if p_decision = 'reject' then
    update public.fund_request_approvals set status = 'skipped'
    where request_id = rec.id and round = rec.current_round and status in ('waiting', 'pending');
    update public.fund_requests set status = 'rejected', updated_at = now() where id = rec.id returning * into rec;
    perform public.log_audit(rec.organization_id, 'funds.rejected', 'fund_request', rec.id,
      'Fund request ' || rec.request_number || ' rejected', jsonb_build_object('comment', p_comment, 'step', st.step_name));
    perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.rejected',
      'fund_request', rec.id, 'Your fund request ' || rec.request_number || ' was rejected', 'info');
    return rec;
  end if;

  if p_decision = 'return' then
    update public.fund_request_approvals set status = 'skipped'
    where request_id = rec.id and round = rec.current_round and status in ('waiting', 'pending');
    update public.fund_requests set status = 'returned', updated_at = now() where id = rec.id returning * into rec;
    perform public.log_audit(rec.organization_id, 'funds.returned', 'fund_request', rec.id,
      'Fund request ' || rec.request_number || ' returned for clarification', jsonb_build_object('comment', p_comment, 'step', st.step_name));
    perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.returned',
      'fund_request', rec.id, 'Your fund request ' || rec.request_number || ' needs clarification', 'info');
    return rec;
  end if;

  update public.fund_requests set approved_amount = coalesce(round(p_amount, 2), v_ceiling), updated_at = now()
  where id = rec.id returning * into rec;

  perform public.log_audit(rec.organization_id, 'funds.step_approved', 'fund_request', rec.id,
    'Fund request ' || rec.request_number || ' approved at "' || coalesce(st.step_name, st.stage) || '"',
    jsonb_build_object('step', st.step_name, 'amount', rec.approved_amount, 'delegate_for', case when v_for <> auth.uid() then v_for end));

  -- Parallel steps: wait until every row in this step group is decided.
  if exists (select 1 from public.fund_request_approvals where request_id = rec.id and round = rec.current_round and step = st.step and status = 'pending') then
    return rec;
  end if;

  select min(step) into v_next from public.fund_request_approvals where request_id = rec.id and round = rec.current_round and status = 'waiting';
  if v_next is not null then
    update public.fund_request_approvals set status = 'pending' where request_id = rec.id and round = rec.current_round and status = 'waiting' and step = v_next;
    update public.fund_requests set current_step = v_next where id = rec.id returning * into rec;
    perform public.notify_fund_step(rec.id);
  else
    update public.fund_requests set status = 'approved', updated_at = now() where id = rec.id returning * into rec;
    perform public.log_audit(rec.organization_id, 'funds.approved', 'fund_request', rec.id,
      'Fund request ' || rec.request_number || ' approved', jsonb_build_object('requested', rec.amount, 'approved', rec.approved_amount));
    perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.approved',
      'fund_request', rec.id,
      'Your fund request ' || rec.request_number || ' was approved'
        || case when rec.approved_amount < rec.amount then ' for ₦' || to_char(rec.approved_amount, 'FM999,999,999,990.00') else '' end,
      'info');
    perform public.notify_fund_managers(rec.id, 'funds.ready_to_disburse',
      'Fund request ' || rec.request_number || ' is approved and ready to pay out');
  end if;
  return rec;
end;
$$;

create or replace function public.act_on_fund_request(p_request uuid, p_approve boolean, p_comment text default null)
returns public.fund_requests
language sql
security definer
set search_path = public
as $$
  select public.decide_fund_request(p_request, case when p_approve then 'approve' else 'reject' end, p_comment, null);
$$;

create or replace function public.cancel_fund_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
begin
  update public.fund_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request and user_id = auth.uid() and status in ('draft', 'pending', 'returned', 'approved')
  returning * into rec;
  if rec.id is null then
    raise exception 'Nothing to withdraw — this request isn''t yours, or payment has already started';
  end if;
  update public.fund_request_approvals set status = 'skipped' where request_id = rec.id and status in ('pending', 'waiting');
  perform public.log_audit(rec.organization_id, 'funds.cancelled', 'fund_request', rec.id,
    'Fund request ' || coalesce(rec.request_number, '(draft)') || ' withdrawn');
end;
$$;

create or replace function public.mark_fund_payment_processing(p_request uuid)
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
  if rec.status <> 'approved' then
    raise exception 'Only approved requests can move to payment processing';
  end if;
  update public.fund_requests set status = 'payment_processing', updated_at = now() where id = rec.id returning * into rec;
  perform public.log_audit(rec.organization_id, 'funds.payment_processing', 'fund_request', rec.id,
    'Payment processing started for ' || rec.request_number);
  return rec;
end;
$$;

drop function if exists public.disburse_fund_request(uuid, numeric, text, text);
create or replace function public.disburse_fund_request(
  p_request uuid,
  p_amount numeric,
  p_method text default null,
  p_reference text default null,
  p_paid_on date default null,
  p_notes text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_days integer;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
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
$$;

grant execute on function public.save_fund_request(uuid, text, text, numeric, uuid, date, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.submit_fund_request(uuid, text, text, numeric, date, uuid, text) to authenticated;
grant execute on function public.delete_fund_draft(uuid) to authenticated;
grant execute on function public.decide_fund_request(uuid, text, text, numeric) to authenticated;
grant execute on function public.act_on_fund_request(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_fund_request(uuid) to authenticated;
grant execute on function public.mark_fund_payment_processing(uuid) to authenticated;
grant execute on function public.disburse_fund_request(uuid, numeric, text, text, date, text) to authenticated;

-- Approval Centre helper: request ids the caller can act on right now.
create or replace function public.my_fund_approvals(p_org uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct a.request_id
  from public.fund_request_approvals a
  join public.fund_requests fr on fr.id = a.request_id and fr.current_round = a.round
  where fr.organization_id = p_org and fr.status = 'pending' and a.status = 'pending'
    and public.fund_step_acting_for(a.id, auth.uid()) is not null;
$$;
grant execute on function public.my_fund_approvals(uuid) to authenticated;
