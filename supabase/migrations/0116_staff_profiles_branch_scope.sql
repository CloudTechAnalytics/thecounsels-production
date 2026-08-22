-- ============================================================================
-- Migration 0116 — staff_profiles.branch_id (HR branch scoping).
--
-- Adds a real FK column ALONGSIDE the existing free-text office_branch —
-- does not touch or replace it. hr_announcements' 'branch' audience-type
-- text-equality match against office_branch keeps working completely
-- unchanged; migrating that RPC to branch_id-based matching is an explicit
-- out-of-scope follow-up, deferred deliberately, not silently dropped.
-- ============================================================================

alter table public.staff_profiles add column branch_id uuid references public.branches(id) on delete set null;
create index idx_staff_profiles_branch on public.staff_profiles (branch_id) where branch_id is not null;

update public.staff_profiles sp set branch_id = hq.id
from public.branches hq
where sp.branch_id is null and hq.organization_id = sp.organization_id and hq.is_head_office;

drop policy if exists "staff_profiles_select" on public.staff_profiles;
create policy "staff_profiles_select" on public.staff_profiles
  for select using (
    public.has_permission(organization_id, 'staff.view')
    and (branch_id is null or public.user_has_branch_access(organization_id, branch_id))
  );

-- Self-view/self-edit (user_id = auth.uid()) is preserved as its own
-- unconditional OR-arm, unaffected by branch logic — a "personal" (or any)
-- scope member can always see/edit their own record's non-locked fields,
-- matching the existing precedent that individual-ownership bypasses never
-- get branch-gated.
drop policy if exists "staff_profiles_write" on public.staff_profiles;
create policy "staff_profiles_write" on public.staff_profiles
  for all using (
    (public.has_permission(organization_id, 'staff.manage') and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    or user_id = auth.uid()
  )
  with check (
    (public.has_permission(organization_id, 'staff.manage') and (branch_id is null or public.user_has_branch_access(organization_id, branch_id)))
    or user_id = auth.uid()
  );

-- protect_employment_fields() (0078) locks HR-owned fields against
-- self-editing — branch_id joins that list exactly like office_branch
-- already does. Same signature, safe create-or-replace.
create or replace function public.protect_employment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(new.organization_id, 'staff.manage') then
    new.employee_code := old.employee_code;
    new.department_id := old.department_id;
    new.job_title_id := old.job_title_id;
    new.manager_id := old.manager_id;
    new.employment_type := old.employment_type;
    new.employment_status := old.employment_status;
    new.start_date := old.start_date;
    new.end_date := old.end_date;
    new.office_branch := old.office_branch;
    new.work_email := old.work_email;
    new.hourly_rate := old.hourly_rate;
    new.bar_number := old.bar_number;
    new.year_admitted := old.year_admitted;
    new.qualifications := old.qualifications;
    new.specializations := old.specializations;
    new.branch_id := old.branch_id;
  end if;
  return new;
end;
$$;
