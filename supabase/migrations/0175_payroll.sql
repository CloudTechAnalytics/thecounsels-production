-- ============================================================================
-- Migration 0175 — Payroll: salary records, monthly runs, payslips, and
-- Nigerian statutory deductions (PAYE, pension, NHF).
--
-- The PAYE computation itself runs in the app (src/features/payroll/lib/
-- payroll-calc.ts) from the rates stored here, so a firm can see exactly how
-- each figure was reached before approving. The database owns the parts that
-- must not be bypassed: who can see salaries, that an approved run is
-- frozen, and that employees only ever see their own payslips — and only
-- once the run is approved.
--
-- Defaults follow the Nigeria Tax Act 2025 (in force 1 Jan 2026): 0% on the
-- first ₦800,000 of annual taxable income, then 15/18/21/23/25%; rent relief
-- of 20% of annual rent capped at ₦500,000; pension 8% employee / 10%
-- employer on basic+housing+transport (Pension Reform Act 2014); NHF 2.5% of
-- basic. Every rate is editable per firm in payroll_settings.
-- ============================================================================

insert into public.permissions (key, resource, action, description) values
  ('payroll.manage',   'payroll', 'manage',   'Manage salaries, run payroll and see every payslip'),
  ('payroll.view_own', 'payroll', 'view_own', 'View your own payslips')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'payroll.view_own'
  and r.key not in ('platform_owner', 'platform_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'payroll.manage'
where r.key in ('managing_partner', 'finance', 'hr_manager')
on conflict do nothing;

create table public.payroll_settings (
  organization_id        uuid primary key references public.organizations(id) on delete cascade,
  pension_employee_rate  numeric(5,2) not null default 8,
  pension_employer_rate  numeric(5,2) not null default 10,
  nhf_rate               numeric(5,2) not null default 2.5,
  rent_relief_rate       numeric(5,2) not null default 20,
  rent_relief_cap        numeric(14,2) not null default 500000,
  minimum_wage_monthly   numeric(14,2) not null default 70000,
  tax_bands              jsonb not null default '[
    {"upto": 800000,   "rate": 0},
    {"upto": 3000000,  "rate": 15},
    {"upto": 12000000, "rate": 18},
    {"upto": 25000000, "rate": 21},
    {"upto": 50000000, "rate": 23},
    {"upto": null,     "rate": 25}
  ]'::jsonb,
  updated_by             uuid references public.profiles(id) on delete set null,
  updated_at             timestamptz not null default now()
);
alter table public.payroll_settings enable row level security;
create policy "payroll_settings_select" on public.payroll_settings
  for select using (public.has_permission(organization_id, 'payroll.manage'));
create policy "payroll_settings_insert" on public.payroll_settings
  for insert with check (public.has_permission(organization_id, 'payroll.manage') and public.org_has_feature(organization_id, 'hr_module'));
create policy "payroll_settings_update" on public.payroll_settings
  for update using (public.has_permission(organization_id, 'payroll.manage'))
  with check (public.has_permission(organization_id, 'payroll.manage'));

-- Monthly amounts. One row per employee on payroll.
create table public.employee_salaries (
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  user_id                uuid not null references public.profiles(id) on delete cascade,
  on_payroll             boolean not null default true,
  basic                  numeric(14,2) not null default 0 check (basic >= 0),
  housing                numeric(14,2) not null default 0 check (housing >= 0),
  transport              numeric(14,2) not null default 0 check (transport >= 0),
  other_allowances       numeric(14,2) not null default 0 check (other_allowances >= 0),
  annual_rent            numeric(14,2) not null default 0 check (annual_rent >= 0),
  pension_enabled        boolean not null default true,
  nhf_enabled            boolean not null default true,
  other_deductions       numeric(14,2) not null default 0 check (other_deductions >= 0),
  other_deductions_note  text,
  bank_name              text,
  account_number         text,
  account_name           text,
  tax_id                 text,
  pension_pin            text,
  pension_administrator  text,
  updated_by             uuid references public.profiles(id) on delete set null,
  updated_at             timestamptz not null default now(),
  primary key (organization_id, user_id)
);
alter table public.employee_salaries enable row level security;
create policy "employee_salaries_select" on public.employee_salaries
  for select using (
    public.has_permission(organization_id, 'payroll.manage')
    or (user_id = auth.uid() and public.has_permission(organization_id, 'payroll.view_own'))
  );
create policy "employee_salaries_insert" on public.employee_salaries
  for insert with check (public.has_permission(organization_id, 'payroll.manage') and public.org_has_feature(organization_id, 'hr_module'));
create policy "employee_salaries_update" on public.employee_salaries
  for update using (public.has_permission(organization_id, 'payroll.manage'))
  with check (public.has_permission(organization_id, 'payroll.manage'));
create policy "employee_salaries_delete" on public.employee_salaries
  for delete using (public.has_permission(organization_id, 'payroll.manage'));

create table public.payroll_runs (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  period                   date not null check (extract(day from period) = 1),
  status                   text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  employee_count           integer not null default 0,
  total_gross              numeric(16,2) not null default 0,
  total_paye               numeric(16,2) not null default 0,
  total_pension_employee   numeric(16,2) not null default 0,
  total_pension_employer   numeric(16,2) not null default 0,
  total_nhf                numeric(16,2) not null default 0,
  total_other_deductions   numeric(16,2) not null default 0,
  total_net                numeric(16,2) not null default 0,
  notes                    text,
  created_by               uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at               timestamptz not null default now(),
  approved_by              uuid references public.profiles(id) on delete set null,
  approved_at              timestamptz,
  paid_by                  uuid references public.profiles(id) on delete set null,
  paid_at                  timestamptz,
  unique (organization_id, period)
);
alter table public.payroll_runs enable row level security;
create policy "payroll_runs_select" on public.payroll_runs
  for select using (public.has_permission(organization_id, 'payroll.manage'));
create policy "payroll_runs_insert" on public.payroll_runs
  for insert with check (status = 'draft' and public.has_permission(organization_id, 'payroll.manage') and public.org_has_feature(organization_id, 'hr_module'));
-- Drafts only — approve/pay/reopen go through the RPCs below.
create policy "payroll_runs_update" on public.payroll_runs
  for update using (status = 'draft' and public.has_permission(organization_id, 'payroll.manage'))
  with check (status = 'draft' and public.has_permission(organization_id, 'payroll.manage'));
create policy "payroll_runs_delete" on public.payroll_runs
  for delete using (status = 'draft' and public.has_permission(organization_id, 'payroll.manage'));

create table public.payslips (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  run_id                 uuid not null references public.payroll_runs(id) on delete cascade,
  user_id                uuid not null references public.profiles(id) on delete cascade,
  employee_name          text not null,
  job_title              text,
  department             text,
  bank_name              text,
  account_number         text,
  account_name           text,
  tax_id                 text,
  pension_pin            text,
  basic                  numeric(14,2) not null default 0,
  housing                numeric(14,2) not null default 0,
  transport              numeric(14,2) not null default 0,
  other_allowances       numeric(14,2) not null default 0,
  gross                  numeric(14,2) not null default 0,
  pension_employee       numeric(14,2) not null default 0,
  pension_employer       numeric(14,2) not null default 0,
  nhf                    numeric(14,2) not null default 0,
  paye                   numeric(14,2) not null default 0,
  other_deductions       numeric(14,2) not null default 0,
  other_deductions_note  text,
  net                    numeric(14,2) not null default 0,
  tax_detail             jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  unique (run_id, user_id)
);
create index idx_payslips_org_user on public.payslips (organization_id, user_id);

create or replace function public.payroll_run_status(p_run uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status from public.payroll_runs where id = p_run;
$$;
grant execute on function public.payroll_run_status(uuid) to authenticated;

alter table public.payslips enable row level security;
create policy "payslips_select" on public.payslips
  for select using (
    public.has_permission(organization_id, 'payroll.manage')
    or (
      user_id = auth.uid()
      and public.has_permission(organization_id, 'payroll.view_own')
      and public.payroll_run_status(run_id) in ('approved', 'paid')
    )
  );
create policy "payslips_insert" on public.payslips
  for insert with check (public.has_permission(organization_id, 'payroll.manage') and public.payroll_run_status(run_id) = 'draft');
create policy "payslips_update" on public.payslips
  for update using (public.has_permission(organization_id, 'payroll.manage') and public.payroll_run_status(run_id) = 'draft')
  with check (public.has_permission(organization_id, 'payroll.manage') and public.payroll_run_status(run_id) = 'draft');
create policy "payslips_delete" on public.payslips
  for delete using (public.has_permission(organization_id, 'payroll.manage') and public.payroll_run_status(run_id) = 'draft');

-- Employees need their run's period/paid date for their own payslips.
create policy "payroll_runs_select_own" on public.payroll_runs
  for select using (
    status in ('approved', 'paid')
    and exists (select 1 from public.payslips ps where ps.run_id = payroll_runs.id and ps.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- RPCs: approve (freezes the run, recomputes totals server-side, releases
-- payslips), mark paid, reopen an approved-but-unpaid run for corrections.
-- ---------------------------------------------------------------------------
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
  from public.payslips ps where ps.run_id = rec.id;
  return rec;
end;
$$;

create or replace function public.mark_payroll_paid(p_run uuid)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.payroll_runs;
begin
  select * into rec from public.payroll_runs where id = p_run for update;
  if rec.id is null then
    raise exception 'Payroll run not found';
  end if;
  if not public.has_permission(rec.organization_id, 'payroll.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'approved' then
    raise exception 'Approve the payroll before marking it paid';
  end if;
  update public.payroll_runs set status = 'paid', paid_by = auth.uid(), paid_at = now()
  where id = p_run returning * into rec;
  perform public.log_audit(rec.organization_id, 'payroll.paid', 'payroll_run', rec.id,
    'Payroll for ' || to_char(rec.period, 'FMMonth YYYY') || ' marked as paid',
    jsonb_build_object('net', rec.total_net));
  return rec;
end;
$$;

create or replace function public.reopen_payroll_run(p_run uuid)
returns public.payroll_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.payroll_runs;
begin
  select * into rec from public.payroll_runs where id = p_run for update;
  if rec.id is null then
    raise exception 'Payroll run not found';
  end if;
  if not public.has_permission(rec.organization_id, 'payroll.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'approved' then
    raise exception 'Only an approved, unpaid payroll can be reopened';
  end if;
  update public.payroll_runs set status = 'draft', approved_by = null, approved_at = null
  where id = p_run returning * into rec;
  perform public.log_audit(rec.organization_id, 'payroll.reopened', 'payroll_run', rec.id,
    'Payroll for ' || to_char(rec.period, 'FMMonth YYYY') || ' reopened for changes');
  return rec;
end;
$$;

grant execute on function public.approve_payroll_run(uuid) to authenticated;
grant execute on function public.mark_payroll_paid(uuid) to authenticated;
grant execute on function public.reopen_payroll_run(uuid) to authenticated;
