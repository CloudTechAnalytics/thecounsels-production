-- ============================================================================
-- Migration 0205 — Payroll: one-off pay items, staff loans & salary advances.
--
-- payroll_adjustments  one-off items for one person in one month: a bonus,
--                      overtime, an extra allowance (taxable or not) or a
--                      one-off deduction. Picked up when that month's payroll
--                      is (re)generated.
-- staff_loans          a loan or salary advance: amount, monthly repayment,
--                      first month to deduct. Deducted automatically each
--                      payroll until repaid; can be cancelled.
-- loan_repayments      what each payroll run deducted for each loan — rebuilt
--                      with the run's payslips, removed if the run is deleted,
--                      so the outstanding balance always matches real payslips.
-- payslips gain: bonus (taxable one-off earnings), non_taxable_earnings,
-- loan_deduction and extra_lines (the itemised one-offs for the payslip).
-- gross includes the one-offs; other_deductions includes one-off deductions
-- and loan repayments, so run totals (approve_payroll_run) stay correct.
-- Same access as payroll: payroll managers firm-wide; staff see their own
-- loans. Requires the 'payroll' plan feature to create.
-- ============================================================================

create table if not exists public.payroll_adjustments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null references public.employees(id) on delete cascade,
  period          date not null check (extract(day from period) = 1),
  kind            text not null check (kind in ('bonus', 'overtime', 'allowance', 'deduction')),
  label           text not null check (length(trim(label)) between 1 and 120),
  amount          numeric(14,2) not null check (amount > 0),
  taxable         boolean not null default true,
  created_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_payroll_adjustments_period on public.payroll_adjustments (organization_id, period);

create table if not exists public.staff_loans (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  employee_id         uuid not null references public.employees(id) on delete cascade,
  kind                text not null default 'loan' check (kind in ('loan', 'salary_advance')),
  principal           numeric(14,2) not null check (principal > 0),
  monthly_installment numeric(14,2) not null check (monthly_installment > 0),
  start_period        date not null check (extract(day from start_period) = 1),
  reason              text,
  status              text not null default 'active' check (status in ('active', 'cancelled')),
  created_by          uuid default auth.uid() references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  check (monthly_installment <= principal)
);
create index if not exists idx_staff_loans_org on public.staff_loans (organization_id, status);

create table if not exists public.loan_repayments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  loan_id         uuid not null references public.staff_loans(id) on delete cascade,
  run_id          uuid not null references public.payroll_runs(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  created_at      timestamptz not null default now(),
  unique (loan_id, run_id)
);

alter table public.payslips
  add column if not exists bonus numeric(14,2) not null default 0,
  add column if not exists non_taxable_earnings numeric(14,2) not null default 0,
  add column if not exists loan_deduction numeric(14,2) not null default 0,
  add column if not exists extra_lines jsonb not null default '[]'::jsonb;

-- Who may manage these: payroll managers with firm-wide reach (as payroll runs).
create or replace function public.can_manage_payroll(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(p_org, 'payroll.manage') and public.user_is_firm_wide(p_org);
$$;
grant execute on function public.can_manage_payroll(uuid) to authenticated;

alter table public.payroll_adjustments enable row level security;
alter table public.staff_loans enable row level security;
alter table public.loan_repayments enable row level security;

drop policy if exists payroll_adjustments_select on public.payroll_adjustments;
create policy payroll_adjustments_select on public.payroll_adjustments for select using (public.can_manage_payroll(organization_id));
drop policy if exists payroll_adjustments_write on public.payroll_adjustments;
create policy payroll_adjustments_write on public.payroll_adjustments for all
  using (public.can_manage_payroll(organization_id)
         and not exists (select 1 from public.payroll_runs r where r.organization_id = payroll_adjustments.organization_id and r.period = payroll_adjustments.period and r.status in ('approved', 'paid')))
  with check (public.can_manage_payroll(organization_id) and public.org_has_feature(organization_id, 'payroll')
         and not exists (select 1 from public.payroll_runs r where r.organization_id = payroll_adjustments.organization_id and r.period = payroll_adjustments.period and r.status in ('approved', 'paid')));

drop policy if exists staff_loans_select on public.staff_loans;
create policy staff_loans_select on public.staff_loans for select using (
  public.can_manage_payroll(organization_id)
  or exists (select 1 from public.employees e where e.id = staff_loans.employee_id and e.user_id = auth.uid()));
drop policy if exists staff_loans_insert on public.staff_loans;
create policy staff_loans_insert on public.staff_loans for insert
  with check (public.can_manage_payroll(organization_id) and public.org_has_feature(organization_id, 'payroll'));
drop policy if exists staff_loans_update on public.staff_loans;
create policy staff_loans_update on public.staff_loans for update
  using (public.can_manage_payroll(organization_id)) with check (public.can_manage_payroll(organization_id));
-- A loan with repayments is cancelled, never deleted (keeps the history).
drop policy if exists staff_loans_delete on public.staff_loans;
create policy staff_loans_delete on public.staff_loans for delete
  using (public.can_manage_payroll(organization_id) and not exists (select 1 from public.loan_repayments x where x.loan_id = staff_loans.id));

drop policy if exists loan_repayments_select on public.loan_repayments;
create policy loan_repayments_select on public.loan_repayments for select using (
  public.can_manage_payroll(organization_id)
  or exists (select 1 from public.staff_loans l join public.employees e on e.id = l.employee_id where l.id = loan_repayments.loan_id and e.user_id = auth.uid()));
drop policy if exists loan_repayments_write on public.loan_repayments;
create policy loan_repayments_write on public.loan_repayments for all
  using (public.can_manage_payroll(organization_id) and public.payroll_run_status(run_id) = 'draft')
  with check (public.can_manage_payroll(organization_id) and public.payroll_run_status(run_id) = 'draft');

grant select, insert, update, delete on public.payroll_adjustments, public.staff_loans, public.loan_repayments to authenticated;
