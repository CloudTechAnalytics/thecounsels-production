-- ============================================================================
-- Migration 0185 — Reimbursing employees who spent more than they were paid.
--
-- Flow (rows in fund_refunds with direction = 'reimbursement'):
--   claimed   — employee claims the overspend, with a reason/evidence
--   approved  — an approver for their branch signs off (all or part); spend
--               still inside the originally approved amount is approved
--               automatically, because it was already authorised
--   confirmed — finance has paid it (date, method, reference)
--   rejected  — declined: the employee bears that amount
--   withdrawn — employee took the claim back before a decision
--
--   outstanding = disbursed − verified − confirmed refunds
--                 + reimbursements paid + amounts borne by the employee
-- A declined (or partly approved) claim still closes the books: the part
-- the firm won't pay is recorded as borne by the employee, not lost.
-- Nobody approves or pays their own claim; branch access applies (0182).
-- ============================================================================

alter table public.fund_refunds drop constraint if exists fund_refunds_status_check;
alter table public.fund_refunds add constraint fund_refunds_status_check
  check (status in ('declared', 'claimed', 'approved', 'confirmed', 'rejected', 'withdrawn'));
alter table public.fund_refunds
  add column if not exists approved_amount numeric(14,2),
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists auto_approved boolean not null default false;
-- Reimbursements recorded directly by finance before this migration were paid in full.
update public.fund_refunds set approved_amount = coalesce(approved_amount, amount), approved_by = coalesce(approved_by, confirmed_by),
  approved_at = coalesce(approved_at, confirmed_at)
where direction = 'reimbursement' and status = 'confirmed';

alter table public.fund_requests
  add column if not exists reimbursement_claimed numeric(14,2) not null default 0,
  add column if not exists reimbursement_due numeric(14,2) not null default 0,
  add column if not exists excess_borne numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Balances (replaces 0179's settle_fund_request)
-- ---------------------------------------------------------------------------
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
         coalesce(sum(amount) filter (where direction = 'reimbursement' and status = 'rejected'), 0)
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

-- Overspend the employee can still claim: what's owed minus claims in flight.
create or replace function public.fund_claimable(p_request uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    -(fr.disbursed_amount - fr.accepted_amount - fr.refunded_amount + fr.reimbursed_amount + fr.excess_borne)
      - fr.reimbursement_claimed - fr.reimbursement_due,
    0)
  from public.fund_requests fr where fr.id = p_request;
$$;
revoke execute on function public.fund_claimable(uuid) from public, anon, authenticated;

-- Can this person approve reimbursement claims on this request?
create or replace function public.can_approve_reimbursement(p_request uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request and fr.user_id <> p_user
      and public.member_has_permission(fr.organization_id, p_user, 'funds.approve')
      and public.member_has_branch_access(fr.organization_id, p_user, fr.branch_id)
  );
$$;
revoke execute on function public.can_approve_reimbursement(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Employee claims the overspend
-- ---------------------------------------------------------------------------
create or replace function public.claim_fund_reimbursement(
  p_request uuid,
  p_amount numeric,
  p_reason text default null,
  p_evidence_path text default null,
  p_evidence_name text default null
)
returns public.fund_refunds
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  claim public.fund_refunds;
  v_claimable numeric(14,2);
  v_headroom numeric(14,2);
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null or rec.user_id <> auth.uid() then
    raise exception 'Fund request not found';
  end if;
  if rec.status not in ('partially_retired', 'retirement_submitted', 'disbursed') then
    raise exception 'Reimbursement can only be claimed on an open advance';
  end if;
  v_claimable := public.fund_claimable(rec.id);
  if v_claimable <= 0 then
    raise exception 'Your verified expenses are not above the amount you were paid, so there is nothing to claim';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_claimable then
    raise exception 'You can claim between ₦1 and ₦% (verified spend above what you were paid)', v_claimable;
  end if;
  if p_evidence_path is not null and split_part(p_evidence_path, '/', 2) <> rec.id::text then
    raise exception 'Evidence file does not belong to this request';
  end if;

  -- Spend still inside the originally approved amount was already authorised.
  v_headroom := greatest(coalesce(rec.approved_amount, rec.amount) - rec.disbursed_amount - rec.reimbursed_amount - rec.reimbursement_due, 0);

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, notes, direction, status,
                                   declared_by, declared_at, recorded_by, evidence_path, evidence_name,
                                   approved_amount, approved_at, auto_approved)
  values (rec.organization_id, rec.id, round(p_amount, 2), current_date, nullif(trim(coalesce(p_reason, '')), ''),
          'reimbursement', case when p_amount <= v_headroom then 'approved' else 'claimed' end,
          auth.uid(), now(), auth.uid(), p_evidence_path, p_evidence_name,
          case when p_amount <= v_headroom then round(p_amount, 2) end,
          case when p_amount <= v_headroom then now() end,
          p_amount <= v_headroom)
  returning * into claim;
  update public.fund_requests set last_retirement_at = now() where id = rec.id;
  perform public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.reimbursement_claimed', 'fund_request', rec.id,
    'Reimbursement of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' claimed for ' || rec.request_number
      || case when claim.auto_approved then ' (within the originally approved amount — approved automatically)' else '' end,
    jsonb_build_object('claim_id', claim.id, 'amount', p_amount, 'reason', p_reason, 'auto_approved', claim.auto_approved));

  if claim.auto_approved then
    perform public.notify_fund_managers(rec.id, 'funds.reimbursement_due',
      'Reimbursement of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' for ' || rec.request_number || ' is ready to pay');
  else
    perform public.notify_user(rec.organization_id, m.user_id, auth.uid(), 'hr', 'funds.reimbursement_claimed', 'fund_request', rec.id,
      'Reimbursement of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' claimed on ' || rec.request_number || ' needs your approval', 'info')
    from public.memberships m
    where m.organization_id = rec.organization_id and m.status = 'active'
      and public.can_approve_reimbursement(rec.id, m.user_id);
  end if;
  return claim;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approver decides (all, part, or none)
-- ---------------------------------------------------------------------------
create or replace function public.decide_fund_reimbursement(
  p_claim uuid,
  p_approve boolean,
  p_amount numeric default null,
  p_reason text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  claim public.fund_refunds;
  rec public.fund_requests;
  v_amount numeric(14,2);
begin
  select * into claim from public.fund_refunds where id = p_claim and direction = 'reimbursement' for update;
  if claim.id is null then
    raise exception 'Reimbursement claim not found';
  end if;
  select * into rec from public.fund_requests where id = claim.request_id for update;
  if not public.can_approve_reimbursement(rec.id, auth.uid()) then
    raise exception 'You are not an approver for this reimbursement' using errcode = '42501';
  end if;
  if claim.status <> 'claimed' then
    raise exception 'This claim has already been %', claim.status;
  end if;
  v_amount := coalesce(round(p_amount, 2), claim.amount);
  if p_approve and (v_amount <= 0 or v_amount > claim.amount) then
    raise exception 'Approve between ₦1 and the ₦% claimed', claim.amount;
  end if;
  if (not p_approve or v_amount < claim.amount) and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for declining (or approving less than claimed)';
  end if;

  update public.fund_refunds set
    status = case when p_approve then 'approved' else 'rejected' end,
    approved_amount = case when p_approve then v_amount end,
    approved_by = auth.uid(), approved_at = now(),
    rejection_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = claim.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id,
    case when p_approve then 'funds.reimbursement_approved' else 'funds.reimbursement_declined' end, 'fund_request', rec.id,
    case when p_approve
      then 'Reimbursement of ₦' || to_char(v_amount, 'FM999,999,999,990.00') || ' approved for ' || rec.request_number
           || case when v_amount < claim.amount then ' (₦' || to_char(claim.amount - v_amount, 'FM999,999,999,990.00') || ' borne by the employee)' else '' end
      else 'Reimbursement claim of ₦' || to_char(claim.amount, 'FM999,999,999,990.00') || ' declined for ' || rec.request_number || ' — borne by the employee' end,
    jsonb_build_object('claim_id', claim.id, 'claimed', claim.amount, 'approved', case when p_approve then v_amount end, 'reason', p_reason));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_approve then 'funds.reimbursement_approved' else 'funds.reimbursement_declined' end, 'fund_request', rec.id,
    case when p_approve then 'Your reimbursement of ₦' || to_char(v_amount, 'FM999,999,999,990.00') || ' for ' || rec.request_number || ' was approved — finance will pay it'
         else 'Your reimbursement claim for ' || rec.request_number || ' was declined: ' || trim(p_reason) end,
    'info');
  if p_approve then
    perform public.notify_fund_managers(rec.id, 'funds.reimbursement_due',
      'Reimbursement of ₦' || to_char(v_amount, 'FM999,999,999,990.00') || ' for ' || rec.request_number || ' is approved — please pay it');
  end if;
  return rec;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance pays an approved claim
-- ---------------------------------------------------------------------------
create or replace function public.pay_fund_reimbursement(
  p_claim uuid,
  p_paid_on date default null,
  p_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  claim public.fund_refunds;
  rec public.fund_requests;
begin
  select * into claim from public.fund_refunds where id = p_claim and direction = 'reimbursement' for update;
  if claim.id is null then
    raise exception 'Reimbursement claim not found';
  end if;
  select * into rec from public.fund_requests where id = claim.request_id for update;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
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
$$;

-- Employee can withdraw a claim (or refund declaration) before anyone acts.
create or replace function public.withdraw_fund_refund(p_refund uuid)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  ref public.fund_refunds;
  rec public.fund_requests;
begin
  select * into ref from public.fund_refunds where id = p_refund for update;
  if ref.id is null then
    raise exception 'Record not found';
  end if;
  select * into rec from public.fund_requests where id = ref.request_id for update;
  if rec.user_id <> auth.uid() or ref.declared_by is distinct from auth.uid() then
    raise exception 'You can only withdraw something you submitted';
  end if;
  if ref.status not in ('declared', 'claimed') then
    raise exception 'This has already been %', ref.status;
  end if;
  update public.fund_refunds set status = 'withdrawn' where id = ref.id;
  rec := public.settle_fund_request(rec.id);
  perform public.log_audit(rec.organization_id,
    case when ref.direction = 'reimbursement' then 'funds.reimbursement_withdrawn' else 'funds.refund_withdrawn' end, 'fund_request', rec.id,
    case when ref.direction = 'reimbursement' then 'Reimbursement claim' else 'Refund declaration' end
      || ' of ₦' || to_char(ref.amount, 'FM999,999,999,990.00') || ' withdrawn by the employee',
    jsonb_build_object('refund_id', ref.id, 'amount', ref.amount));
  return rec;
end;
$$;

-- Finance's old one-step "approve and pay" now only covers spend that was
-- already authorised (inside the originally approved amount); anything
-- above needs the employee's claim and an approver.
create or replace function public.record_fund_reimbursement(
  p_request uuid,
  p_amount numeric,
  p_paid_on date default null,
  p_method text default null,
  p_reference text default null,
  p_notes text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Reimbursements now go through a claim: the employee claims the overspend, an approver signs it off, then finance pays it.';
end;
$$;

-- Approval Centre: requests with a claim this user can decide.
create or replace function public.my_reimbursement_approvals(p_org uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct f.request_id
  from public.fund_refunds f
  where f.organization_id = p_org and f.direction = 'reimbursement' and f.status = 'claimed'
    and public.can_approve_reimbursement(f.request_id, auth.uid());
$$;

grant execute on function public.claim_fund_reimbursement(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.decide_fund_reimbursement(uuid, boolean, numeric, text) to authenticated;
grant execute on function public.pay_fund_reimbursement(uuid, date, text, text, text) to authenticated;
grant execute on function public.my_reimbursement_approvals(uuid) to authenticated;

-- Refresh balances on every paid-out advance.
do $$
declare r record;
begin
  for r in select id from public.fund_requests where disbursed_amount is not null and status <> 'closed' loop
    perform public.settle_fund_request(r.id);
  end loop;
end $$;
