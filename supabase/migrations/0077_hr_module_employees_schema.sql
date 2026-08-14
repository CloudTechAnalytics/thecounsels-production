-- ============================================================================
-- Migration 0077 — HR & People Management, Part 3: Departments, Job Titles,
-- and the Employees data model.
--
-- Employees are NOT a new table — profiles + memberships already identify
-- every person, and staff_profiles (0014) already exists as the 1:1
-- "firm-specific professional data" extension of a profile (bar number,
-- qualifications, hourly rate, etc.). This extends that same table with
-- the HR fields the module needs, instead of creating a second, competing
-- "employees" table that would duplicate name/email/avatar (already on
-- profiles) and create two sources of truth for the same person.
-- ============================================================================

create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.departments enable row level security;
create policy "departments_select" on public.departments
  for select using (public.has_permission(organization_id, 'departments.view'));
create policy "departments_write" on public.departments
  for all using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage'));

-- Job titles are configured the same way departments are (small,
-- org-managed reference lists) — reusing the departments.* permission
-- pair rather than adding a near-identical second one.
create table public.job_titles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.job_titles enable row level security;
create policy "job_titles_select" on public.job_titles
  for select using (public.has_permission(organization_id, 'departments.view'));
create policy "job_titles_write" on public.job_titles
  for all using (public.has_permission(organization_id, 'departments.manage'))
  with check (public.has_permission(organization_id, 'departments.manage'));

alter table public.staff_profiles
  add column if not exists employee_code text,
  add column if not exists department_id uuid references public.departments(id) on delete set null,
  add column if not exists job_title_id uuid references public.job_titles(id) on delete set null,
  add column if not exists manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists employment_type text not null default 'full_time'
    check (employment_type in ('full_time', 'part_time', 'contract', 'intern')),
  add column if not exists employment_status text not null default 'active'
    check (employment_status in ('applicant', 'onboarding', 'active', 'on_leave', 'suspended', 'resigned', 'terminated', 'former_employee')),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists office_branch text,
  add column if not exists address text,
  add column if not exists date_of_birth date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists work_email citext;

-- Employment-controlled fields (everything HR owns) are locked against
-- self-editing — the existing staff_profiles_write policy already lets a
-- user update their OWN row (for the personal fields: bio, phone, address,
-- availability, emergency contact, date of birth), but without this
-- trigger they could also silently promote their own department/title/
-- status/manager/pay rate through the exact same row-level access. Only
-- staff.manage holders (HR roles, leadership) can actually change these.
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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_employment_fields on public.staff_profiles;
create trigger trg_protect_employment_fields
  before update on public.staff_profiles
  for each row execute function public.protect_employment_fields();
