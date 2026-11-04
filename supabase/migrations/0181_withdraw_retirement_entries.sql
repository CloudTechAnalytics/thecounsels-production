-- ============================================================================
-- Migration 0181 — Employees can take back retirement entries they've
-- sent, until finance has acted on them.
--
-- * An expense line awaiting verification can be pulled back to "not sent"
--   (then edited or deleted like any unsent line).
-- * A declared refund awaiting confirmation can be withdrawn. It stays on
--   record as "withdrawn" — refund rows are financial history and are never
--   deleted — and stops counting as pending.
-- Once finance has verified/rejected a line or confirmed/rejected a refund,
-- it can no longer be withdrawn.
-- ============================================================================

alter table public.fund_refunds drop constraint if exists fund_refunds_status_check;
alter table public.fund_refunds add constraint fund_refunds_status_check
  check (status in ('declared', 'confirmed', 'rejected', 'withdrawn'));

create or replace function public.withdraw_retirement_item(p_item uuid)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.fund_retirement_items;
  rec public.fund_requests;
begin
  select * into it from public.fund_retirement_items where id = p_item for update;
  if it.id is null then
    raise exception 'Expense not found';
  end if;
  select * into rec from public.fund_requests where id = it.request_id for update;
  if rec.user_id <> auth.uid() then
    raise exception 'You can only withdraw your own expenses';
  end if;
  if it.review_status <> 'submitted' then
    raise exception 'Only an expense still waiting for verification can be withdrawn';
  end if;
  update public.fund_retirement_items set review_status = 'draft', submitted_at = null where id = it.id;
  rec := public.settle_fund_request(rec.id);
  perform public.log_audit(rec.organization_id, 'funds.expense_withdrawn', 'fund_request', rec.id,
    'Expense "' || it.description || '" (₦' || to_char(it.amount, 'FM999,999,999,990.00') || ') withdrawn from verification by the employee',
    jsonb_build_object('item_id', it.id, 'amount', it.amount));
  return rec;
end;
$$;

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
    raise exception 'Refund not found';
  end if;
  select * into rec from public.fund_requests where id = ref.request_id for update;
  if rec.user_id <> auth.uid() or ref.declared_by is distinct from auth.uid() then
    raise exception 'You can only withdraw a refund you declared';
  end if;
  if ref.status <> 'declared' then
    raise exception 'This refund has already been %', ref.status;
  end if;
  update public.fund_refunds set status = 'withdrawn' where id = ref.id;
  rec := public.settle_fund_request(rec.id);
  perform public.log_audit(rec.organization_id, 'funds.refund_withdrawn', 'fund_request', rec.id,
    'Refund declaration of ₦' || to_char(ref.amount, 'FM999,999,999,990.00') || ' withdrawn by the employee',
    jsonb_build_object('refund_id', ref.id, 'amount', ref.amount));
  return rec;
end;
$$;

grant execute on function public.withdraw_retirement_item(uuid) to authenticated;
grant execute on function public.withdraw_fund_refund(uuid) to authenticated;
