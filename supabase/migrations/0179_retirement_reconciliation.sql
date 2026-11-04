-- ============================================================================
-- Migration 0179 — Expense retirement: verified balances, refund
-- declarations, line-level verification, reimbursements, deadlines,
-- overdue reminders, closure and audit history.
--
-- Builds on 0178 (partial retirement + finance-recorded refunds). Nothing is
-- overwritten: every expense line and every refund/reimbursement stays as
-- its own row with who did what and when; balances are recomputed from
-- those rows by one function (settle_fund_request) after every action.
--
--   outstanding = disbursed − verified expenses − confirmed refunds
--                 + confirmed reimbursements (firm paying back overspend)
--
-- Only verified expenses and confirmed refunds move the balance. Submitted
-- receipts and declared refunds are shown as pending, never as settled.
--
-- Retirement status (fund_requests.retirement_status) is derived:
--   not_started → in_progress → pending_verification / refund_pending →
--   partially_retired / outstanding_balance / excess_spend → fully_retired
--   → closed (finance closes a fully reconciled advance). "Overdue" is
--   computed from retirement_due_date and shown alongside.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.fund_requests drop constraint if exists fund_requests_status_check;
alter table public.fund_requests add constraint fund_requests_status_check check (status in (
  'draft', 'pending', 'returned', 'approved', 'rejected', 'cancelled', 'payment_processing',
  'disbursed', 'retirement_submitted', 'partially_retired', 'retired', 'closed'
));
alter table public.fund_requests
  add column if not exists retirement_status text,
  add column if not exists retirement_due_date date,
  add column if not exists submitted_expenses numeric(14,2) not null default 0,
  add column if not exists pending_refunds numeric(14,2) not null default 0,
  add column if not exists reimbursed_amount numeric(14,2) not null default 0,
  add column if not exists last_retirement_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_overdue_notice_on date;

alter table public.fund_settings
  add column if not exists retirement_due_basis text not null default 'disbursement'
    check (retirement_due_basis in ('disbursement', 'needed_by'));

alter table public.fund_retirement_items
  add column if not exists category text,
  add column if not exists vendor text,
  add column if not exists notes text,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

alter table public.fund_refunds
  add column if not exists direction text not null default 'refund' check (direction in ('refund', 'reimbursement')),
  add column if not exists status text not null default 'confirmed' check (status in ('declared', 'confirmed', 'rejected')),
  add column if not exists declared_by uuid references public.profiles(id) on delete set null,
  add column if not exists declared_at timestamptz,
  add column if not exists confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists evidence_path text,
  add column if not exists evidence_name text,
  add column if not exists is_exception boolean not null default false,
  add column if not exists exception_reason text;
-- Rows from 0178 were recorded directly by finance: treat as confirmed by them.
update public.fund_refunds set confirmed_by = coalesce(confirmed_by, recorded_by), confirmed_at = coalesce(confirmed_at, created_at),
  declared_by = coalesce(declared_by, recorded_by), declared_at = coalesce(declared_at, created_at);
create index if not exists idx_fund_refunds_status on public.fund_refunds (organization_id, status);

-- Refund evidence: {org}/{request}/refunds/... — requester while the advance is open.
create policy "fund_refund_evidence_insert" on storage.objects
  for insert with check (
    bucket_id = 'fund-receipts' and (storage.foldername(name))[3] = 'refunds'
    and public.can_edit_fund_retirement(((storage.foldername(name))[2])::uuid)
  );

create or replace function public.can_edit_fund_retirement(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request and fr.user_id = auth.uid()
      and fr.status in ('disbursed', 'partially_retired', 'retirement_submitted')
  );
$$;

-- Lines: employee adds/removes unsent lines only (policies from 0178 kept);
-- verification goes through review_retirement_items() below.

-- ---------------------------------------------------------------------------
-- The one place balances and statuses are computed.
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
         coalesce(sum(amount) filter (where direction = 'reimbursement' and status = 'confirmed'), 0)
    into v_refunded, v_pending_refunds, v_reimbursed
  from public.fund_refunds where request_id = rec.id;

  v_outstanding := rec.disbursed_amount - v_verified - v_refunded + v_reimbursed;

  if v_submitted > 0 then
    v_status := 'retirement_submitted'; v_rstatus := 'pending_verification';
  elsif v_pending_refunds > 0 then
    v_status := 'retirement_submitted'; v_rstatus := 'refund_pending';
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
    spent_amount = v_verified + v_submitted,
    status = v_status, retirement_status = v_rstatus,
    retired_at = case when v_status = 'retired' then coalesce(retired_at, now()) else null end,
    updated_at = now()
  where id = rec.id returning * into rec;
  return rec;
end;
$$;
revoke execute on function public.settle_fund_request(uuid) from public, anon, authenticated;

-- Due date from the firm's rule, set at payout.
create or replace function public.compute_retirement_due(p_request uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(s.retirement_due_basis, 'disbursement')
           when 'needed_by' then coalesce(fr.needed_by, fr.payment_date, fr.disbursed_at::date)
           else coalesce(fr.payment_date, fr.disbursed_at::date)
         end + coalesce(s.retirement_due_days, 14)
  from public.fund_requests fr
  left join public.fund_settings s on s.organization_id = fr.organization_id
  where fr.id = p_request;
$$;
revoke execute on function public.compute_retirement_due(uuid) from public, anon, authenticated;

-- Existing open advances: fill the new columns.
do $$
declare r record;
begin
  for r in select id from public.fund_requests where disbursed_amount is not null and status <> 'closed' loop
    update public.fund_requests set retirement_due_date = coalesce(retirement_due_date, public.compute_retirement_due(r.id)) where id = r.id;
    perform public.settle_fund_request(r.id);
  end loop;
end $$;

-- Payout now also sets the retirement due date (date-only change: wrap 0176's function).
create or replace function public.set_retirement_due_on_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'disbursed' and old.status is distinct from 'disbursed' and old.disbursed_amount is null then
    new.retirement_due_date := coalesce(new.retirement_due_date,
      (select case coalesce(s.retirement_due_basis, 'disbursement')
                when 'needed_by' then coalesce(new.needed_by, new.payment_date, current_date)
                else coalesce(new.payment_date, current_date) end + coalesce(s.retirement_due_days, 14)
       from public.fund_settings s where s.organization_id = new.organization_id),
      coalesce(new.payment_date, current_date) + 14);
    new.retirement_status := 'not_started';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_set_retirement_due_on_payout on public.fund_requests;
create trigger trg_set_retirement_due_on_payout
  before update on public.fund_requests
  for each row execute function public.set_retirement_due_on_payout();

-- ---------------------------------------------------------------------------
-- Employee: submit a batch (lines and/or refund declarations go to finance)
-- ---------------------------------------------------------------------------
create or replace function public.submit_fund_retirement(p_request uuid, p_note text default null)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_count integer;
  v_batch numeric(14,2);
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null or rec.user_id <> auth.uid() then
    raise exception 'Fund request not found';
  end if;
  if rec.status not in ('disbursed', 'partially_retired', 'retirement_submitted') then
    raise exception 'There is nothing to retire on this request right now';
  end if;
  select count(*), coalesce(sum(amount), 0) into v_count, v_batch
  from public.fund_retirement_items where request_id = rec.id and review_status = 'draft';
  if v_count = 0 then
    raise exception 'Add at least one expense line before submitting';
  end if;

  update public.fund_retirement_items set review_status = 'submitted', submitted_at = now(), review_comment = null
  where request_id = rec.id and review_status = 'draft';
  update public.fund_requests set retirement_note = nullif(trim(coalesce(p_note, '')), ''),
    retirement_submitted_at = now(), last_retirement_at = now()
  where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.retirement_submitted', 'fund_request', rec.id,
    'Expenses submitted for ' || rec.request_number || ': ' || v_count || ' line' || case when v_count = 1 then '' else 's' end
      || ', ₦' || to_char(v_batch, 'FM999,999,999,990.00'),
    jsonb_build_object('batch', v_batch, 'lines', v_count, 'note', p_note));
  perform public.notify_fund_managers(rec.id, 'funds.retirement_submitted',
    'Expenses for ' || rec.request_number || ' are waiting for verification');
  return rec;
end;
$$;

-- Employee declares unused money returned, with optional evidence.
create or replace function public.declare_fund_refund(
  p_request uuid,
  p_amount numeric,
  p_returned_on date default null,
  p_method text default null,
  p_reference text default null,
  p_notes text default null,
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
  ref public.fund_refunds;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null or rec.user_id <> auth.uid() then
    raise exception 'Fund request not found';
  end if;
  if rec.status not in ('disbursed', 'partially_retired', 'retirement_submitted') then
    raise exception 'Refunds can only be declared while an advance is open';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount returned must be greater than zero';
  end if;
  if p_evidence_path is not null and split_part(p_evidence_path, '/', 2) <> rec.id::text then
    raise exception 'Evidence file does not belong to this request';
  end if;

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, method, reference, notes,
                                   direction, status, declared_by, declared_at, recorded_by, evidence_path, evidence_name)
  values (rec.organization_id, rec.id, round(p_amount, 2), coalesce(p_returned_on, current_date),
          nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
          'refund', 'declared', auth.uid(), now(), auth.uid(), p_evidence_path, p_evidence_name)
  returning * into ref;
  update public.fund_requests set last_retirement_at = now() where id = rec.id;
  perform public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.refund_declared', 'fund_request', rec.id,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' declared for ' || rec.request_number,
    jsonb_build_object('refund_id', ref.id, 'amount', p_amount, 'method', p_method, 'reference', p_reference));
  perform public.notify_fund_managers(rec.id, 'funds.refund_declared',
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' declared for ' || rec.request_number || ' — please confirm receipt');
  return ref;
end;
$$;

-- Finance confirms or rejects a declared refund. Row lock + status check
-- makes a second confirmation impossible.
create or replace function public.verify_fund_refund(
  p_refund uuid,
  p_confirm boolean,
  p_reason text default null,
  p_allow_excess boolean default false
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  ref public.fund_refunds;
  rec public.fund_requests;
  v_open numeric(14,2);
begin
  select * into ref from public.fund_refunds where id = p_refund for update;
  if ref.id is null then
    raise exception 'Refund not found';
  end if;
  select * into rec from public.fund_requests where id = ref.request_id for update;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot verify a refund on your own advance';
  end if;
  if ref.status <> 'declared' then
    raise exception 'This refund has already been %', ref.status;
  end if;
  if not p_confirm and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for rejecting the refund';
  end if;

  if p_confirm then
    -- What's still unaccounted for once already-confirmed money is counted.
    v_open := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount;
    if ref.amount > v_open and not p_allow_excess then
      raise exception 'This refund (₦%) is more than the unaccounted balance (₦%). Confirm it as an exception with a reason if the money was genuinely received.', ref.amount, greatest(v_open, 0);
    end if;
    if ref.amount > v_open and coalesce(trim(p_reason), '') = '' then
      raise exception 'Give a reason for accepting a refund above the balance';
    end if;
    update public.fund_refunds set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
      is_exception = ref.amount > v_open, exception_reason = case when ref.amount > v_open then trim(p_reason) end
    where id = ref.id;
  else
    update public.fund_refunds set status = 'rejected', confirmed_by = auth.uid(), confirmed_at = now(), rejection_reason = trim(p_reason)
    where id = ref.id;
  end if;

  rec := public.settle_fund_request(rec.id);
  perform public.log_audit(rec.organization_id, case when p_confirm then 'funds.refund_confirmed' else 'funds.refund_rejected' end,
    'fund_request', rec.id,
    'Refund of ₦' || to_char(ref.amount, 'FM999,999,999,990.00') || case when p_confirm then ' confirmed' else ' rejected' end || ' for ' || rec.request_number,
    jsonb_build_object('refund_id', ref.id, 'amount', ref.amount, 'reason', p_reason, 'exception', p_confirm and ref.amount > coalesce(v_open, 0),
                       'outstanding', rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when p_confirm then 'funds.refund_confirmed' else 'funds.refund_rejected' end, 'fund_request', rec.id,
    case when p_confirm then 'Your refund of ₦' || to_char(ref.amount, 'FM999,999,999,990.00') || ' for ' || rec.request_number || ' was confirmed'
         else 'Your refund declaration for ' || rec.request_number || ' was rejected: ' || trim(p_reason) end,
    'info');
  return rec;
end;
$$;

-- Finance records money received directly (no prior declaration) — 0178's
-- function, now writing a confirmed refund row with the officer recorded.
create or replace function public.record_fund_refund(
  p_request uuid,
  p_amount numeric,
  p_received_on date default null,
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
  rec public.fund_requests;
  v_open numeric(14,2);
  v_refund uuid;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot record a refund on your own advance — another finance manager must';
  end if;
  if rec.status not in ('disbursed', 'partially_retired', 'retirement_submitted') then
    raise exception 'Refunds can only be recorded while an advance is still open';
  end if;
  v_open := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount - rec.pending_refunds;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund must be greater than zero';
  end if;
  if p_amount > v_open then
    raise exception 'Refund (₦%) is more than the unaccounted balance (₦%) — confirm any declared refunds first', p_amount, greatest(v_open, 0);
  end if;

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, method, reference, notes,
                                   direction, status, declared_by, declared_at, confirmed_by, confirmed_at, recorded_by)
  values (rec.organization_id, rec.id, round(p_amount, 2), coalesce(p_received_on, current_date),
          nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
          'refund', 'confirmed', auth.uid(), now(), auth.uid(), now(), auth.uid())
  returning id into v_refund;
  update public.fund_requests set last_retirement_at = now() where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.refund_confirmed', 'fund_request', rec.id,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' received and confirmed for ' || rec.request_number,
    jsonb_build_object('refund_id', v_refund, 'amount', p_amount, 'method', p_method, 'reference', p_reference,
                       'outstanding', rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.refund_confirmed', 'fund_request', rec.id,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' received for ' || rec.request_number
      || case when rec.status = 'retired' then ' — this advance is fully retired' else '' end,
    'info');
  return rec;
end;
$$;

-- Finance pays the employee back for approved spend above the advance.
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
declare
  rec public.fund_requests;
  v_over numeric(14,2);
  v_id uuid;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot reimburse yourself — another finance manager must';
  end if;
  v_over := -(rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount);
  if v_over <= 0 then
    raise exception 'Nothing is owed to the employee on this advance';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_over then
    raise exception 'Reimbursement must be between ₦1 and the verified overspend (₦%)', v_over;
  end if;

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, method, reference, notes,
                                   direction, status, declared_by, declared_at, confirmed_by, confirmed_at, recorded_by)
  values (rec.organization_id, rec.id, round(p_amount, 2), coalesce(p_paid_on, current_date),
          nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
          'reimbursement', 'confirmed', auth.uid(), now(), auth.uid(), now(), auth.uid())
  returning id into v_id;
  rec := public.settle_fund_request(rec.id);
  perform public.log_audit(rec.organization_id, 'funds.reimbursed', 'fund_request', rec.id,
    'Additional expenditure of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' approved and reimbursed for ' || rec.request_number,
    jsonb_build_object('refund_id', v_id, 'amount', p_amount, 'method', p_method, 'reference', p_reference));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.reimbursed', 'fund_request', rec.id,
    '₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' reimbursed to you for extra spend on ' || rec.request_number, 'info');
  return rec;
end;
$$;

-- Finance verifies lines individually: accept, reject (stays on record,
-- with a reason) or return for correction (back to the employee to edit).
create or replace function public.review_retirement_items(p_request uuid, p_decisions jsonb)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  d jsonb;
  it public.fund_retirement_items;
  v_accept numeric(14,2) := 0;
  v_reject numeric(14,2) := 0;
  v_return integer := 0;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot verify expenses on your own advance';
  end if;
  if jsonb_typeof(p_decisions) <> 'array' or jsonb_array_length(p_decisions) = 0 then
    raise exception 'No decisions given';
  end if;

  for d in select * from jsonb_array_elements(p_decisions) loop
    select * into it from public.fund_retirement_items
    where id = (d->>'id')::uuid and request_id = rec.id for update;
    if it.id is null then
      raise exception 'Expense line not found on this request';
    end if;
    if it.review_status <> 'submitted' then
      raise exception 'Line "%" is not awaiting verification', it.description;
    end if;
    if d->>'decision' not in ('accept', 'reject', 'return') then
      raise exception 'Unknown decision for "%"', it.description;
    end if;
    if d->>'decision' in ('reject', 'return') and coalesce(trim(d->>'comment'), '') = '' then
      raise exception 'Give a reason for "%"', it.description;
    end if;
    update public.fund_retirement_items set
      review_status = case d->>'decision' when 'accept' then 'accepted' when 'reject' then 'rejected' else 'draft' end,
      reviewed_at = now(), reviewed_by = auth.uid(),
      review_comment = nullif(trim(coalesce(d->>'comment', '')), '')
    where id = it.id;
    if d->>'decision' = 'accept' then v_accept := v_accept + it.amount;
    elsif d->>'decision' = 'reject' then v_reject := v_reject + it.amount;
    else v_return := v_return + 1; end if;
  end loop;

  update public.fund_requests set retirement_reviewed_by = auth.uid(), retirement_reviewed_at = now() where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.expenses_verified', 'fund_request', rec.id,
    'Expenses reviewed for ' || rec.request_number || ': ₦' || to_char(v_accept, 'FM999,999,999,990.00') || ' verified'
      || case when v_reject > 0 then ', ₦' || to_char(v_reject, 'FM999,999,999,990.00') || ' rejected' else '' end
      || case when v_return > 0 then ', ' || v_return || ' returned for correction' else '' end,
    jsonb_build_object('verified', v_accept, 'rejected', v_reject, 'returned', v_return, 'decisions', p_decisions,
                       'outstanding', rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.expenses_verified', 'fund_request', rec.id,
    'Finance reviewed your expenses for ' || rec.request_number
      || case when rec.status = 'retired' then ' — fully retired'
              when rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount > 0
                then ' — ₦' || to_char(rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount + rec.reimbursed_amount, 'FM999,999,999,990.00') || ' still to account for'
              else '' end,
    'info');
  return rec;
end;
$$;

-- 0178's accept-all / query-all, kept as shortcuts over the line-level function.
create or replace function public.review_fund_retirement(p_request uuid, p_accept boolean, p_comment text default null)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not p_accept and coalesce(trim(p_comment), '') = '' then
    raise exception 'Say what needs fixing when querying a retirement';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'decision', case when p_accept then 'accept' else 'return' end, 'comment', p_comment)), '[]'::jsonb)
    into v
  from public.fund_retirement_items where request_id = p_request and review_status = 'submitted';
  if jsonb_array_length(v) = 0 then
    raise exception 'There are no submitted expenses to review';
  end if;
  return public.review_retirement_items(p_request, v);
end;
$$;

-- Finance closes a fully reconciled advance (locks it).
create or replace function public.close_fund_retirement(p_request uuid, p_note text default null)
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
  if rec.user_id = auth.uid() then
    raise exception 'You cannot close your own advance';
  end if;
  rec := public.settle_fund_request(rec.id);
  if rec.status <> 'retired' then
    raise exception 'Only a fully retired advance (zero balance, nothing pending) can be closed';
  end if;
  update public.fund_requests set status = 'closed', retirement_status = 'closed', closed_at = now(), closed_by = auth.uid(), updated_at = now()
  where id = rec.id returning * into rec;
  perform public.log_audit(rec.organization_id, 'funds.closed', 'fund_request', rec.id,
    'Advance ' || rec.request_number || ' reconciled and closed', jsonb_build_object('note', p_note,
      'disbursed', rec.disbursed_amount, 'verified', rec.accepted_amount, 'refunded', rec.refunded_amount, 'reimbursed', rec.reimbursed_amount));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.closed', 'fund_request', rec.id,
    'Your advance ' || rec.request_number || ' is fully reconciled and closed', 'info');
  return rec;
end;
$$;

-- Finance can move an individual deadline (e.g. assignment ran long).
create or replace function public.set_retirement_due_date(p_request uuid, p_due date)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then raise exception 'Fund request not found'; end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot change the deadline on your own advance';
  end if;
  update public.fund_requests set retirement_due_date = p_due, last_overdue_notice_on = null, updated_at = now() where id = rec.id returning * into rec;
  perform public.log_audit(rec.organization_id, 'funds.due_date_changed', 'fund_request', rec.id,
    'Retirement deadline for ' || rec.request_number || ' set to ' || to_char(p_due, 'DD Mon YYYY'));
  return rec;
end;
$$;

-- Audit history for one request, for anyone allowed to see the request.
create or replace function public.fund_request_history(p_request uuid)
returns table (id uuid, created_at timestamptz, action text, summary text, actor_name text, metadata jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.created_at, a.action, a.summary, p.full_name, a.metadata
  from public.audit_logs a
  left join public.profiles p on p.id = a.actor_id
  where public.can_view_fund_request(p_request)
    and (
      (a.entity_type = 'fund_request' and a.entity_id = p_request)
      or (a.entity_type = 'fund_refund' and a.metadata->>'request_id' = p_request::text)
    )
  order by a.created_at;
$$;

grant execute on function public.declare_fund_refund(uuid, numeric, date, text, text, text, text, text) to authenticated;
grant execute on function public.verify_fund_refund(uuid, boolean, text, boolean) to authenticated;
grant execute on function public.record_fund_reimbursement(uuid, numeric, date, text, text, text) to authenticated;
grant execute on function public.review_retirement_items(uuid, jsonb) to authenticated;
grant execute on function public.close_fund_retirement(uuid, text) to authenticated;
grant execute on function public.set_retirement_due_date(uuid, date) to authenticated;
grant execute on function public.fund_request_history(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Overdue reminders: daily, at most once a day per advance, to the
-- employee, finance and their line manager.
-- ---------------------------------------------------------------------------
create or replace function public.run_retirement_overdue_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
  v_owed numeric(14,2);
  v_mgr uuid;
  v_title text;
begin
  for r in
    select * from public.fund_requests
    where status in ('disbursed', 'partially_retired')
      and retirement_due_date is not null and retirement_due_date < current_date
      and (last_overdue_notice_on is null or last_overdue_notice_on < current_date)
  loop
    v_owed := r.disbursed_amount - r.accepted_amount - r.refunded_amount + r.reimbursed_amount;
    continue when v_owed <= 0;
    v_title := 'Retirement overdue: ' || r.request_number || ' — ₦' || to_char(v_owed, 'FM999,999,999,990.00')
      || ' unaccounted for since ' || to_char(r.retirement_due_date, 'DD Mon');
    perform public.notify_user(r.organization_id, r.user_id, null, 'hr', 'funds.retirement_overdue', 'fund_request', r.id, v_title, 'warning');
    perform public.notify_user(r.organization_id, m.user_id, null, 'hr', 'funds.retirement_overdue', 'fund_request', r.id, v_title, 'info')
    from public.memberships m
    where m.organization_id = r.organization_id and m.status = 'active' and m.user_id <> r.user_id
      and public.member_has_permission(r.organization_id, m.user_id, 'funds.manage');
    select mgr.user_id into v_mgr
    from public.employees e join public.employees mgr on mgr.id = e.manager_employee_id
    where e.organization_id = r.organization_id and e.user_id = r.user_id;
    if v_mgr is not null and v_mgr <> r.user_id then
      perform public.notify_user(r.organization_id, v_mgr, null, 'hr', 'funds.retirement_overdue', 'fund_request', r.id, v_title, 'info');
    end if;
    update public.fund_requests set last_overdue_notice_on = current_date where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.run_retirement_overdue_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('retirement-overdue-reminders', '0 7 * * *', 'select public.run_retirement_overdue_reminders();');
  end if;
end $$;
