-- ============================================================================
-- Migration 0178 — Refunds and partial retirement.
--
-- Staff can retire an advance in batches: each submitted batch is reviewed
-- by finance, accepted lines count towards the advance, and the request
-- stays open as "partially_retired" while money is still unaccounted for.
-- Finance records unused money returned (fund_refunds). The request closes
-- as "retired" only once accepted expenses + refunds cover what was paid
-- out — never just because the employee submitted something.
--
--   outstanding = disbursed_amount − accepted expenses − refunds received
--   (negative = the employee spent more than they were given)
-- ============================================================================

alter table public.fund_requests drop constraint if exists fund_requests_status_check;
alter table public.fund_requests add constraint fund_requests_status_check check (status in (
  'draft', 'pending', 'returned', 'approved', 'rejected', 'cancelled',
  'payment_processing', 'disbursed', 'retirement_submitted', 'partially_retired', 'retired'
));
alter table public.fund_requests
  add column if not exists accepted_amount numeric(14,2) not null default 0,
  add column if not exists refunded_amount numeric(14,2) not null default 0;

alter table public.fund_retirement_items
  add column if not exists review_status text not null default 'draft'
    check (review_status in ('draft', 'submitted', 'accepted', 'rejected')),
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_comment text;

update public.fund_retirement_items i set review_status = case fr.status
    when 'retired' then 'accepted'
    when 'retirement_submitted' then 'submitted'
    else 'draft' end,
  submitted_at = case when fr.status in ('retired', 'retirement_submitted') then fr.retirement_submitted_at end,
  reviewed_at = case when fr.status = 'retired' then fr.retirement_reviewed_at end
from public.fund_requests fr where fr.id = i.request_id;

update public.fund_requests fr set accepted_amount = coalesce((
  select sum(amount) from public.fund_retirement_items where request_id = fr.id and review_status = 'accepted'), 0);

create table public.fund_refunds (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id      uuid not null references public.fund_requests(id) on delete cascade,
  amount          numeric(14,2) not null check (amount > 0),
  received_on     date not null default current_date,
  method          text,
  reference       text,
  notes           text,
  recorded_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);
create index idx_fund_refunds_request on public.fund_refunds (request_id);
alter table public.fund_refunds enable row level security;
create policy "fund_refunds_select" on public.fund_refunds
  for select using (public.can_view_fund_request(request_id));
-- No insert/update/delete policy — record_fund_refund() only; refunds are a financial record.

-- Lines can be added while money is out (first batch or later batches),
-- and only unsent lines can be removed.
create or replace function public.can_edit_fund_retirement(p_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.fund_requests fr
    where fr.id = p_request and fr.user_id = auth.uid() and fr.status in ('disbursed', 'partially_retired')
  );
$$;

drop policy if exists "fund_retirement_items_insert" on public.fund_retirement_items;
create policy "fund_retirement_items_insert" on public.fund_retirement_items
  for insert with check (created_by = auth.uid() and review_status = 'draft' and public.can_edit_fund_retirement(request_id));
drop policy if exists "fund_retirement_items_delete" on public.fund_retirement_items;
create policy "fund_retirement_items_delete" on public.fund_retirement_items
  for delete using (review_status = 'draft' and public.can_edit_fund_retirement(request_id));

-- Status after anything changes the numbers: closed once fully accounted for.
create or replace function public.settle_fund_request(p_request uuid)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_accepted numeric(14,2);
  v_refunded numeric(14,2);
  v_pending integer;
  v_status text;
begin
  select * into rec from public.fund_requests where id = p_request;
  select coalesce(sum(amount), 0) into v_accepted from public.fund_retirement_items where request_id = rec.id and review_status = 'accepted';
  select coalesce(sum(amount), 0) into v_refunded from public.fund_refunds where request_id = rec.id;
  select count(*) into v_pending from public.fund_retirement_items where request_id = rec.id and review_status = 'submitted';

  v_status := case
    when v_pending > 0 then 'retirement_submitted'
    when rec.disbursed_amount - v_accepted - v_refunded <= 0 and (v_accepted > 0 or v_refunded > 0) then 'retired'
    when v_accepted > 0 or v_refunded > 0 then 'partially_retired'
    else 'disbursed'
  end;

  update public.fund_requests set
    accepted_amount = v_accepted, refunded_amount = v_refunded,
    spent_amount = v_accepted + coalesce((select sum(amount) from public.fund_retirement_items where request_id = rec.id and review_status = 'submitted'), 0),
    status = v_status,
    retired_at = case when v_status = 'retired' then coalesce(retired_at, now()) else null end,
    updated_at = now()
  where id = rec.id returning * into rec;
  return rec;
end;
$$;
revoke execute on function public.settle_fund_request(uuid) from public, anon, authenticated;

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
  if rec.status not in ('disbursed', 'partially_retired') then
    raise exception 'There is nothing to retire on this request right now';
  end if;
  select count(*), coalesce(sum(amount), 0) into v_count, v_batch from public.fund_retirement_items where request_id = rec.id and review_status = 'draft';
  if v_count = 0 then
    raise exception 'Add at least one expense line before submitting';
  end if;

  update public.fund_retirement_items set review_status = 'submitted', submitted_at = now(), review_comment = null
  where request_id = rec.id and review_status = 'draft';
  update public.fund_requests set retirement_note = nullif(trim(coalesce(p_note, '')), ''), retirement_submitted_at = now()
  where id = rec.id;
  rec := public.settle_fund_request(rec.id);

  perform public.log_audit(rec.organization_id, 'funds.retirement_submitted', 'fund_request', rec.id,
    'Retirement submitted for ' || rec.request_number || ' (' || v_count || ' line' || case when v_count = 1 then '' else 's' end || ')',
    jsonb_build_object('batch', v_batch, 'lines', v_count, 'disbursed', rec.disbursed_amount, 'accepted_so_far', rec.accepted_amount));
  perform public.notify_fund_managers(rec.id, 'funds.retirement_submitted',
    'Retirement for ' || rec.request_number || ' is ready for review');
  return rec;
end;
$$;

-- Finance accepts or queries the submitted batch.
create or replace function public.review_fund_retirement(
  p_request uuid,
  p_accept boolean,
  p_comment text default null
)
returns public.fund_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.fund_requests;
  v_outstanding numeric(14,2);
begin
  select * into rec from public.fund_requests where id = p_request for update;
  if rec.id is null then
    raise exception 'Fund request not found';
  end if;
  if not public.has_permission(rec.organization_id, 'funds.manage') then
    raise exception 'Not permitted' using errcode = '42501';
  end if;
  if rec.status <> 'retirement_submitted' then
    raise exception 'There is no submitted retirement to review';
  end if;
  if rec.user_id = auth.uid() then
    raise exception 'You cannot review your own retirement — another finance manager must review it';
  end if;
  if not p_accept and coalesce(trim(p_comment), '') = '' then
    raise exception 'Say what needs fixing when querying a retirement';
  end if;

  update public.fund_retirement_items set
    review_status = case when p_accept then 'accepted' else 'draft' end,
    reviewed_at = now(),
    review_comment = nullif(trim(coalesce(p_comment, '')), '')
  where request_id = rec.id and review_status = 'submitted';

  update public.fund_requests set retirement_reviewed_by = auth.uid(), retirement_reviewed_at = now(),
    retirement_comment = nullif(trim(coalesce(p_comment, '')), '')
  where id = rec.id;
  rec := public.settle_fund_request(rec.id);
  v_outstanding := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount;

  perform public.log_audit(rec.organization_id,
    case when not p_accept then 'funds.retirement_queried' when rec.status = 'retired' then 'funds.retired' else 'funds.partially_retired' end,
    'fund_request', rec.id,
    case when not p_accept then 'Retirement queried for ' when rec.status = 'retired' then 'Retirement accepted and closed for ' else 'Retirement accepted (partial) for ' end || rec.request_number,
    jsonb_build_object('comment', p_comment, 'accepted', rec.accepted_amount, 'refunded', rec.refunded_amount, 'outstanding', v_outstanding));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr',
    case when not p_accept then 'funds.retirement_queried' when rec.status = 'retired' then 'funds.retired' else 'funds.partially_retired' end,
    'fund_request', rec.id,
    case
      when not p_accept then 'Your retirement for ' || rec.request_number || ' was queried — please review and resubmit'
      when rec.status = 'retired' then 'Your retirement for ' || rec.request_number || ' was accepted and closed'
      when v_outstanding > 0 then 'Retirement accepted for ' || rec.request_number || ' — ₦' || to_char(v_outstanding, 'FM999,999,999,990.00') || ' still to retire or refund'
      else 'Retirement accepted for ' || rec.request_number
    end,
    'info');
  return rec;
end;
$$;

-- Finance records unused money returned by the employee.
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
  v_outstanding numeric(14,2);
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
    raise exception 'You cannot record a refund on your own request — another finance manager must';
  end if;
  if rec.status not in ('disbursed', 'partially_retired', 'retirement_submitted') then
    raise exception 'Refunds can only be recorded while an advance is still open';
  end if;
  v_outstanding := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund must be greater than zero';
  end if;
  if p_amount > v_outstanding then
    raise exception 'Refund (₦%) is more than the outstanding balance (₦%)', p_amount, v_outstanding;
  end if;

  insert into public.fund_refunds (organization_id, request_id, amount, received_on, method, reference, notes)
  values (rec.organization_id, rec.id, round(p_amount, 2), coalesce(p_received_on, current_date),
          nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''))
  returning id into v_refund;

  rec := public.settle_fund_request(rec.id);
  v_outstanding := rec.disbursed_amount - rec.accepted_amount - rec.refunded_amount;

  perform public.log_audit(rec.organization_id, 'funds.refund_recorded', 'fund_refund', v_refund,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' recorded for ' || rec.request_number,
    jsonb_build_object('request_id', rec.id, 'amount', p_amount, 'method', p_method, 'reference', p_reference, 'outstanding', v_outstanding));
  perform public.notify_user(rec.organization_id, rec.user_id, auth.uid(), 'hr', 'funds.refund_recorded',
    'fund_request', rec.id,
    'Refund of ₦' || to_char(p_amount, 'FM999,999,999,990.00') || ' received for ' || rec.request_number
      || case when rec.status = 'retired' then ' — this advance is now closed'
              when v_outstanding > 0 then ' — ₦' || to_char(v_outstanding, 'FM999,999,999,990.00') || ' still outstanding'
              else '' end,
    'info');
  return rec;
end;
$$;
grant execute on function public.record_fund_refund(uuid, numeric, date, text, text, text) to authenticated;

-- The fund_receipts storage insert policy follows can_edit_fund_retirement,
-- so receipts can now be uploaded for later batches too (no change needed).
