-- ============================================================================
-- Migration 0184 — Payroll is run by firm-wide users; branch-scoped people
-- with payroll rights don't get a firm-wide view through it.
--
-- 0182 kept payroll managers firm-wide on the employee register so payroll
-- could see every employee. But HR Managers hold payroll.manage too, so an
-- Abuja-only HR Manager could read the whole firm's register. Now:
--   * payroll.manage widens the register only for a firm-wide membership;
--   * creating, recalculating, approving or paying a payroll run, and
--     editing salaries, needs a firm-wide membership — a branch-scoped
--     person would otherwise build a payroll that silently omits other
--     branches' staff;
--   * a branch-scoped payroll holder can still read salaries/payslips for
--     their own branch's employees.
-- ============================================================================

create or replace function public.user_is_firm_wide(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.access_scope = 'organization'
  );
$$;
grant execute on function public.user_is_firm_wide(uuid) to authenticated;

drop policy if exists "employees_select" on public.employees;
create policy "employees_select" on public.employees
  for select using (
    user_id = auth.uid()
    or (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id))
    or (
      (public.has_permission(organization_id, 'staff.view')
        or public.has_permission(organization_id, 'staff.manage')
        or public.has_permission(organization_id, 'payroll.manage')
        or public.has_permission(organization_id, 'funds.manage'))
      and public.user_has_branch_access(organization_id, branch_id)
    )
  );

-- Salaries: read within reach; change only firm-wide.
drop policy if exists "employee_salaries_select" on public.employee_salaries;
create policy "employee_salaries_select" on public.employee_salaries
  for select using (
    (public.has_permission(organization_id, 'payroll.manage')
      and (public.user_is_firm_wide(organization_id)
           or public.user_has_branch_access(organization_id, (select e.branch_id from public.employees e where e.id = employee_id))))
    or (
      public.has_permission(organization_id, 'payroll.view_own')
      and exists (select 1 from public.employees e where e.id = employee_id and e.user_id = auth.uid())
    )
  );
drop policy if exists "employee_salaries_insert" on public.employee_salaries;
create policy "employee_salaries_insert" on public.employee_salaries
  for insert with check (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id) and public.org_has_feature(organization_id, 'hr_module'));
drop policy if exists "employee_salaries_update" on public.employee_salaries;
create policy "employee_salaries_update" on public.employee_salaries
  for update using (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id))
  with check (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id));
drop policy if exists "employee_salaries_delete" on public.employee_salaries;
create policy "employee_salaries_delete" on public.employee_salaries
  for delete using (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id));

-- Runs: firm-wide only for every write.
drop policy if exists "payroll_runs_select" on public.payroll_runs;
create policy "payroll_runs_select" on public.payroll_runs
  for select using (public.has_permission(organization_id, 'payroll.manage'));
drop policy if exists "payroll_runs_insert" on public.payroll_runs;
create policy "payroll_runs_insert" on public.payroll_runs
  for insert with check (status = 'draft' and public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id) and public.org_has_feature(organization_id, 'hr_module'));
drop policy if exists "payroll_runs_update" on public.payroll_runs;
create policy "payroll_runs_update" on public.payroll_runs
  for update using (status = 'draft' and public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id))
  with check (status = 'draft' and public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id));
drop policy if exists "payroll_runs_delete" on public.payroll_runs;
create policy "payroll_runs_delete" on public.payroll_runs
  for delete using (status = 'draft' and public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id));

-- Payslips: managers read within reach; writes firm-wide only.
drop policy if exists "payslips_select" on public.payslips;
create policy "payslips_select" on public.payslips
  for select using (
    (public.has_permission(organization_id, 'payroll.manage')
      and (public.user_is_firm_wide(organization_id)
           or public.user_has_branch_access(organization_id, (select e.branch_id from public.employees e where e.id = employee_id))))
    or (
      user_id = auth.uid()
      and public.has_permission(organization_id, 'payroll.view_own')
      and public.payroll_run_status(run_id) in ('approved', 'paid')
    )
  );
drop policy if exists "payslips_insert" on public.payslips;
create policy "payslips_insert" on public.payslips
  for insert with check (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id) and public.payroll_run_status(run_id) = 'draft');
drop policy if exists "payslips_update" on public.payslips;
create policy "payslips_update" on public.payslips
  for update using (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id) and public.payroll_run_status(run_id) = 'draft')
  with check (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id) and public.payroll_run_status(run_id) = 'draft');
drop policy if exists "payslips_delete" on public.payslips;
create policy "payslips_delete" on public.payslips
  for delete using (public.has_permission(organization_id, 'payroll.manage') and public.user_is_firm_wide(organization_id) and public.payroll_run_status(run_id) = 'draft');

-- Approve / mark paid / reopen: same rule, enforced inside the RPCs.
create or replace function public.require_firm_wide_payroll(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.user_is_firm_wide(p_org) then
    raise exception 'Payroll covers every branch, so it can only be run by someone with whole-firm access' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.require_firm_wide_payroll(uuid) from public, anon, authenticated;

create or replace function public.guard_payroll_run_firm_wide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.status is distinct from old.status then
    perform public.require_firm_wide_payroll(new.organization_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_payroll_run_firm_wide on public.payroll_runs;
create trigger trg_guard_payroll_run_firm_wide
  before update on public.payroll_runs
  for each row execute function public.guard_payroll_run_firm_wide();
