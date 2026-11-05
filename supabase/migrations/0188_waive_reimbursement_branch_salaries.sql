-- ============================================================================
-- Migration 0188 — waiving a reimbursement; branch HR can set salaries.
--
-- 1. An employee who spent more than their advance can say "no need, I'll
--    bear it": the overspend is recorded as borne by them (status 'waived'),
--    the balance reaches zero and the advance can close — no approval or
--    payment step, since the firm owes nothing.
-- 2. 0184 limited salary writes to firm-wide payroll managers, so a Lagos HR
--    manager could open the salary form but every save failed with a raw
--    row-level-security error. Branch payroll managers may now set salaries
--    for employees in their own branch — never their own. Running payroll
--    stays firm-wide only.
-- ============================================================================

-- 1. Waived reimbursements ------------------------------------------------------
alter table public.fund_refunds drop constraint if exists fund_refunds_status_check;
alter table public.fund_refunds add constraint fund_refunds_status_check
  check (status in ('declared', 'claimed', 'approved', 'confirmed', 'rejected', 'withdrawn', 'waived'));

-- Same as 0185's, with 'waived' counted as borne by the employee.
create or replace function public.settle_fund_request(p_request uuid)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_verified numeric(14,2);
  v_submitted numeric(14,2);
  v_drafts integer;
  v_refunded numeric(14,2);
  v_pending_refunds numeric(14,2);
  v_reimbursed numeric(14,2);
  v_claimed numeric(14,2);
  v_due numeric(14,2);
  v_borne numeric(14,2);
  v_outstanding numeric(14,2);
  v_status text;
  v_rstatus text;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.status = 'closed' or rec.disbursed_amount is null then
    return rec;
  end if;

  select coalesce(sum(amount) filter (where review_status = 'accepted'), 0),
         coalesce(sum(amount) filter (where review_status = 'submitted'), 0),
         count(*) filter (where review_status = 'draft')
    into v_verified, v_submitted, v_drafts
  from public.fund_retirement_items where request_id = rec.id;

  select coalesce(sum(amount) filter (where direction = 'refund' and status = 'confirmed'), 0),
         coalesce(sum(amount) filter (where direction = 'refund' and status = 'declared'), 0),
         coalesce(sum(coalesce(approved_amount, amount)) filter (where direction = 'reimbursement' and status = 'confirmed'), 0),
         coalesce(sum(amount) filter (where direction = 'reimbursement' and status = 'claimed'), 0),
         coalesce(sum(approved_amount) filter (where direction = 'reimbursement' and status = 'approved'), 0),
         coalesce(sum(amount) filter (where direction = 'reimbursement' and status in ('rejected', 'waived')), 0)
           + coalesce(sum(amount - approved_amount) filter (where direction = 'reimbursement' and status in ('approved', 'confirmed') and approved_amount < amount), 0)
    into v_refunded, v_pending_refunds, v_reimbursed, v_claimed, v_due, v_borne
  from public.fund_refunds where request_id = rec.id;

  v_outstanding := rec.disbursed_amount - v_verified - v_refunded + v_reimbursed + v_borne;

  if v_submitted > 0 then
    v_status := 'retirement_submitted'; v_rstatus := 'pending_verification';
  elsif v_pending_refunds > 0 then
    v_status := 'retirement_submitted'; v_rstatus := 'refund_pending';
  elsif v_claimed > 0 then
    v_status := 'partially_retired'; v_rstatus := 'reimbursement_claimed';
  elsif v_due > 0 then
    v_status := 'partially_retired'; v_rstatus := 'reimbursement_due';
  elsif v_outstanding = 0 and (v_verified > 0 or v_refunded > 0) then
    v_status := 'retired'; v_rstatus := 'fully_retired';
  elsif v_outstanding < 0 then
    v_status := 'partially_retired'; v_rstatus := 'excess_spend';
  elsif v_verified > 0 or v_refunded > 0 then
    v_status := 'partially_retired'; v_rstatus := 'partially_retired';
  elsif v_drafts > 0 then
    v_status := 'disbursed'; v_rstatus := 'in_progress';
  else
    v_status := 'disbursed'; v_rstatus := 'not_started';
  end if;

  update public.fund_requests set
    accepted_amount = v_verified, submitted_expenses = v_submitted,
    refunded_amount = v_refunded, pending_refunds = v_pending_refunds, reimbursed_amount = v_reimbursed,
    reimbursement_claimed = v_claimed, reimbursement_due = v_due, excess_borne = v_borne,
    spent_amount = v_verified + v_submitted,
    status = v_status, retirement_status = v_rstatus,
    retired_at = case when v_status = 'retired' then coalesce(retired_at, now()) else null end,
    updated_at = now()
  where id = rec.id returning * into rec;
  return rec;
end;
$$;
revoke execute on function public.settle_fund_request(uuid) from public, anon, authenticated;

-- The employee declines reimbursement of whatever overspend is still unclaimed.
create or replace function public.waive_fund_reimbursement(p_request uuid, p_note text default null)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_amount numeric(14,2);
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null or rec.user_id <> auth.uid() then
    raise exception 'Fund request not found';
  end if;
  if rec.status not in ('partially_retired', 'retirement_submitted', 'disbursed') then
    raise exception 'This advance is not open';
  end if;
  v_amount := public.fund_claimable(rec.id);
  if v_amount <= 0 then
    raise exception 'There is no overspend left to waive';
  end if;

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, notes, direction, status,
                                   declared_by, declared_at, recorded_by)
  values (rec.organization_id, rec.id, v_amount, current_date,
          coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Employee chose not to be reimbursed'),
          'reimbursement', 'waived', auth.uid(), now(), auth.uid());
  update public.fund_requests set last_retirement_at = now() where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.reimbursement_waived', 'fund_request', rec.id,
    '₦' || to_char(v_amount, 'FM999,999,999,990.00') || ' spent above the advance on ' || rec.request_number
      || ' — employee chose not to be reimbursed',
    jsonb_build_object('amount', v_amount, 'note', p_note));
  if rec.status = 'retired' then
    perform public.notify_fund_managers(rec.id, 'funds.retirement_complete',
      rec.request_number || ' is fully accounted for — ready to close');
  end if;
  return rec;
end;
$$;
grant execute on function public.waive_fund_reimbursement(uuid, text) to authenticated;

-- 2. Branch payroll managers set their branch's salaries (not their own) --------
drop policy if exists "employee_salaries_insert" on public.employee_salaries;
create policy "employee_salaries_insert" on public.employee_salaries
  for insert with check (
    public.has_permission(organization_id, 'payroll.manage')
    and public.org_has_feature(organization_id, 'hr_module')
    and (
      public.user_is_firm_wide(organization_id)
      or exists (
        select 1 from public.employees e
        where e.id = employee_salaries.employee_id
          and e.user_id is distinct from auth.uid()
          and public.user_has_branch_access(organization_id, e.branch_id)
      )
    )
  );

drop policy if exists "employee_salaries_update" on public.employee_salaries;
create policy "employee_salaries_update" on public.employee_salaries
  for update
  using (
    public.has_permission(organization_id, 'payroll.manage')
    and (
      public.user_is_firm_wide(organization_id)
      or exists (
        select 1 from public.employees e
        where e.id = employee_salaries.employee_id
          and e.user_id is distinct from auth.uid()
          and public.user_has_branch_access(organization_id, e.branch_id)
      )
    )
  )
  with check (
    public.has_permission(organization_id, 'payroll.manage')
    and (
      public.user_is_firm_wide(organization_id)
      or exists (
        select 1 from public.employees e
        where e.id = employee_salaries.employee_id
          and e.user_id is distinct from auth.uid()
          and public.user_has_branch_access(organization_id, e.branch_id)
      )
    )
  );
