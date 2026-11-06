-- ============================================================================
-- Migration 0193 — fix "permission denied for function approval_allows" when
-- saving a salary.
--
-- 0189 made the employee_salaries policies call approval_allows() directly.
-- Row-level-security expressions run with the signed-in user's privileges,
-- and approval_allows is deliberately not executable by them (it's an
-- internal helper), so every salary save failed. The policies now call one
-- small, purpose-built check that signed-in users may execute; the rule
-- itself is unchanged.
-- ============================================================================

create or replace function public.can_edit_salary(p_org uuid, p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee and e.organization_id = p_org
      and public.approval_allows(p_org, 'salary', auth.uid(), e.branch_id, e.user_id)
      and (public.user_is_firm_wide(p_org)
           or (e.user_id is distinct from auth.uid() and public.user_has_branch_access(p_org, e.branch_id)))
  );
$$;
revoke execute on function public.can_edit_salary(uuid, uuid) from public, anon;
grant execute on function public.can_edit_salary(uuid, uuid) to authenticated;

drop policy if exists "employee_salaries_insert" on public.employee_salaries;
create policy "employee_salaries_insert" on public.employee_salaries
  for insert with check (
    public.org_has_feature(organization_id, 'hr_module')
    and public.can_edit_salary(organization_id, employee_id)
  );

drop policy if exists "employee_salaries_update" on public.employee_salaries;
create policy "employee_salaries_update" on public.employee_salaries
  for update
  using (public.can_edit_salary(organization_id, employee_id))
  with check (public.can_edit_salary(organization_id, employee_id));
