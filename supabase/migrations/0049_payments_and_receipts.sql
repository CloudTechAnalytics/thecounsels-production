-- ============================================================================
-- Migration 0049 — Payments & Receipts.
--
-- Blueprint: assign_invoice_number() (0016) for the numbering pattern,
-- print-invoice.ts for the receipt-PDF pattern (cloned client-side, not
-- here). recalc_invoice_payment() and guard_payment_invoice_status()
-- (0016/0045) are extended in place, not replaced — existing Sent → Partial
-- → Paid behavior, and everything delete_invoice() (0046) already does,
-- stays exactly as-is.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Independent record: client/matter denormalized from the invoice (never
--    independently editable — set server-side, once, at insert), a unique
--    payment number and a unique receipt number per payment.
-- ----------------------------------------------------------------------------
alter table public.payments
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists matter_id uuid references public.matters(id) on delete set null,
  add column if not exists payment_number text,
  add column if not exists receipt_number text;

-- Backfill existing rows from their invoice so the unique constraints below
-- and any historical view of payments stay consistent.
update public.payments p
  set client_id = i.client_id, matter_id = i.matter_id
  from public.invoices i
  where p.invoice_id = i.id and p.client_id is null;

update public.payments
  set payment_number = 'PAY-LEGACY-' || substr(id::text, 1, 8)
  where payment_number is null;
update public.payments
  set receipt_number = 'RCT-LEGACY-' || substr(id::text, 1, 8)
  where receipt_number is null;

alter table public.payments
  add constraint uq_payments_payment_number unique (organization_id, payment_number),
  add constraint uq_payments_receipt_number unique (organization_id, receipt_number);

create table public.billing_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            text not null,
  year            int not null,
  seq             int not null default 0,
  primary key (organization_id, kind, year)
);

create or replace function public.assign_payment_receipt_numbers()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from now())::int;
  n_pay int;
  n_rct int;
  v_client_id uuid;
  v_matter_id uuid;
begin
  select client_id, matter_id into v_client_id, v_matter_id from public.invoices where id = new.invoice_id;
  if not found then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  new.client_id := v_client_id;
  new.matter_id := v_matter_id;

  if new.payment_number is null or new.payment_number = '' then
    insert into public.billing_counters (organization_id, kind, year, seq)
      values (new.organization_id, 'payment', y, 1)
      on conflict (organization_id, kind, year) do update set seq = public.billing_counters.seq + 1
      returning seq into n_pay;
    new.payment_number := 'PAY-' || y || '-' || lpad(n_pay::text, 4, '0');
  end if;

  if new.receipt_number is null or new.receipt_number = '' then
    insert into public.billing_counters (organization_id, kind, year, seq)
      values (new.organization_id, 'receipt', y, 1)
      on conflict (organization_id, kind, year) do update set seq = public.billing_counters.seq + 1
      returning seq into n_rct;
    new.receipt_number := 'RCT-' || y || '-' || lpad(n_rct::text, 4, '0');
  end if;

  return new;
end $$;

drop trigger if exists trg_assign_payment_receipt_numbers on public.payments;
create trigger trg_assign_payment_receipt_numbers
  before insert on public.payments
  for each row execute function public.assign_payment_receipt_numbers();

-- ----------------------------------------------------------------------------
-- 2. Overpayment guard — today only `amount > 0` is checked anywhere.
--    Extends guard_payment_invoice_status() (0045), which already fires
--    BEFORE INSERT and already fetches the invoice row; no new trigger.
-- ----------------------------------------------------------------------------
create or replace function public.guard_payment_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.invoice_status; tot numeric; paid numeric;
begin
  select status, total, amount_paid into st, tot, paid from public.invoices where id = new.invoice_id;
  if st is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if st not in ('sent', 'partial') then
    raise exception 'Payments can only be recorded on Sent or Partially Paid invoices' using errcode = '23514';
  end if;
  if new.amount > (tot - paid) then
    raise exception 'Payment of % exceeds the outstanding balance of %', new.amount, (tot - paid) using errcode = '23514';
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Editing/deleting a recorded payment needs Managing Partner, not the
--    broader payments.manage (already held by Partner and Finance too — too
--    wide for this). New permission key, seeded to managing_partner only,
--    same pattern as 0040/0041.
-- ----------------------------------------------------------------------------
insert into public.permissions (key, resource, action, description)
values ('payments.void', 'payments', 'void', 'Edit or delete a recorded payment')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'payments.void'
  and r.key = 'managing_partner'
on conflict do nothing;

drop policy if exists "payments_write" on public.payments;

create policy "payments_insert" on public.payments
  for insert
  with check (
    public.has_financial_access(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

create policy "payments_update" on public.payments
  for update
  using (
    public.has_financial_access(organization_id, 'payments.void')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_financial_access(organization_id, 'payments.void')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

create policy "payments_delete" on public.payments
  for delete using (
    public.has_financial_access(organization_id, 'payments.void')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Invoice status keeps recalculating on an edited payment amount too —
--    today only insert/delete trigger the recalc (0016/0045).
-- ----------------------------------------------------------------------------
drop trigger if exists trg_recalc_invoice_payment on public.payments;
create trigger trg_recalc_invoice_payment
  after insert or update or delete on public.payments
  for each row execute function public.recalc_invoice_payment();

-- ----------------------------------------------------------------------------
-- 5. Activity Timeline. track_invoice_status_changed (0045) only fires on a
--    status *change*, so a 2nd/3rd partial payment on an already-partial
--    invoice produced no timeline entry before — this logs directly in the
--    payment path instead, every time.
-- ----------------------------------------------------------------------------
create or replace function public.track_payment_recorded()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; inv_number text; m_id uuid;
begin
  select invoice_number, matter_id into inv_number, m_id from public.invoices where id = new.invoice_id;
  if m_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = coalesce(new.created_by, auth.uid());
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, m_id, coalesce(new.created_by, auth.uid()), 'payment_recorded',
    coalesce(actor_name, 'Someone') || ' recorded a payment of ₦' || new.amount || ' on Invoice ' || coalesce(inv_number, '')
      || ' (Receipt ' || new.receipt_number || ')',
    jsonb_build_object('payment_id', new.id, 'invoice_id', new.invoice_id, 'amount', new.amount, 'receipt_number', new.receipt_number));
  return new;
end $$;

drop trigger if exists trg_track_payment_recorded on public.payments;
create trigger trg_track_payment_recorded
  after insert on public.payments
  for each row execute function public.track_payment_recorded();

create or replace function public.track_payment_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; m_id uuid;
begin
  if new.amount is not distinct from old.amount
     and new.method is not distinct from old.method
     and new.reference is not distinct from old.reference
     and new.paid_at is not distinct from old.paid_at then
    return new;
  end if;
  select matter_id into m_id from public.invoices where id = new.invoice_id;
  if m_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, m_id, auth.uid(), 'payment_updated',
    coalesce(actor_name, 'Someone') || ' edited payment ' || new.payment_number
      || ' — amount changed from ₦' || old.amount || ' to ₦' || new.amount,
    jsonb_build_object('payment_id', new.id, 'from_amount', old.amount, 'to_amount', new.amount));
  return new;
end $$;

drop trigger if exists trg_track_payment_updated on public.payments;
create trigger trg_track_payment_updated
  after update on public.payments
  for each row execute function public.track_payment_updated();

-- Cascade-guarded the same way 0028/0033/0047/0048 already established:
-- deleting the parent invoice/org cascades here too, and that path (e.g.
-- delete_invoice, 0046) already logs its own "invoice deleted" event — this
-- only fires for a genuine standalone payment deletion.
create or replace function public.track_payment_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; m_id uuid;
begin
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.invoices where id = old.invoice_id) then
    return old;
  end if;
  select matter_id into m_id from public.invoices where id = old.invoice_id;
  if m_id is null then return old; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, m_id, auth.uid(), 'payment_deleted',
    coalesce(actor_name, 'Someone') || ' deleted payment ' || old.payment_number || ' — ₦' || old.amount,
    jsonb_build_object('payment_id', old.id, 'amount', old.amount));
  return old;
end $$;

drop trigger if exists trg_track_payment_deleted on public.payments;
create trigger trg_track_payment_deleted
  after delete on public.payments
  for each row execute function public.track_payment_deleted();
