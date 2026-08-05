-- ============================================================================
-- Migration 0045 — Billing & Invoicing enterprise readiness, Phase 1.
--
-- Status workflow (draft/sent/partial/paid/void), draft-only line-item
-- editing with server-computed totals, payment-recording guardrails, Void
-- with a mandatory reason, Delete Draft with full reversal of linked
-- time entries/expenses, a real Platform-Admin financial-record carve-out
-- anchored on the existing support_sessions table, matter-timeline entries
-- for every status change, and audit-log gaps closed on addExpense/
-- deleteExpense/addPayment. See idempotent-twirling-rose.md for the full
-- 18-section spec this implements (Phase 1 of 3).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema: partial status, discount/tax_rate/void_reason, payment notes.
-- ----------------------------------------------------------------------------
alter type public.invoice_status add value if not exists 'partial';

alter table public.invoices
  add column if not exists discount numeric(12,2) not null default 0,
  add column if not exists tax_rate numeric(5,2) not null default 0,
  add column if not exists void_reason text;

alter table public.payments
  add column if not exists notes text;

-- ----------------------------------------------------------------------------
-- 2. Platform Admin financial-record carve-out.
--
-- Every other table lets is_platform_admin() bypass permission checks
-- unconditionally (via has_permission()). Financial records are the one
-- deliberate exception: a platform admin only sees an org's invoices/
-- payments while holding an active, unexpired support_sessions row for
-- that org (the real, server-verifiable mechanism from 0017) — never by
-- default. Everyone else's access is unchanged (falls through to the
-- existing has_permission()).
-- ----------------------------------------------------------------------------
create or replace function public.has_financial_access(p_org uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin() then exists (
      select 1 from public.support_sessions s
      where s.organization_id = p_org
        and s.admin_id = auth.uid()
        and s.ended_at is null
        and s.expires_at > now()
    )
    else public.has_permission(p_org, p_perm)
  end;
$$;

grant execute on function public.has_financial_access(uuid, text) to authenticated;

-- Rewire invoices/invoice_items/payments RLS onto has_financial_access, and
-- add the draft-only status gate to invoice_items writes (today nothing
-- stops editing a *sent* invoice's line items beyond the UI simply not
-- offering it).
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (
    public.has_financial_access(organization_id, 'billing.view')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices
  for all
  using (
    public.has_financial_access(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  )
  with check (
    public.has_financial_access(organization_id, 'invoices.manage')
    and (matter_id is null or public.has_matter_access(matter_id))
  );

drop policy if exists "invoice_items_select" on public.invoice_items;
create policy "invoice_items_select" on public.invoice_items
  for select using (
    public.has_financial_access(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "invoice_items_write" on public.invoice_items;
create policy "invoice_items_write" on public.invoice_items
  for all
  using (
    public.has_financial_access(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
        and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_financial_access(organization_id, 'invoices.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft'
        and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select using (
    public.has_financial_access(organization_id, 'billing.view')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments
  for all
  using (
    public.has_financial_access(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  )
  with check (
    public.has_financial_access(organization_id, 'payments.manage')
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and (i.matter_id is null or public.has_matter_access(i.matter_id))
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Server-side totals: recompute subtotal/tax/total whenever line items
--    change, or whenever discount/tax_rate are edited directly — never
--    trusted from the client, matching how amount_paid already works.
-- ----------------------------------------------------------------------------
create or replace function public.recompute_invoice_tax_before_update()
returns trigger language plpgsql as $$
declare taxable numeric;
begin
  taxable := greatest(coalesce(new.subtotal, 0) - coalesce(new.discount, 0), 0);
  new.tax := round(taxable * coalesce(new.tax_rate, 0) / 100.0, 2);
  new.total := taxable + new.tax;
  return new;
end $$;

drop trigger if exists trg_recompute_invoice_tax on public.invoices;
create trigger trg_recompute_invoice_tax
  before update of discount, tax_rate on public.invoices
  for each row execute function public.recompute_invoice_tax_before_update();

create or replace function public.recompute_invoice_totals_on_items()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv_id uuid := coalesce(new.invoice_id, old.invoice_id);
  sub numeric;
  disc numeric;
  rate numeric;
  taxable numeric;
  tax_amt numeric;
begin
  select coalesce(sum(amount), 0) into sub from public.invoice_items where invoice_id = inv_id;
  select coalesce(discount, 0), coalesce(tax_rate, 0) into disc, rate from public.invoices where id = inv_id;
  taxable := greatest(sub - disc, 0);
  tax_amt := round(taxable * rate / 100.0, 2);
  update public.invoices set subtotal = sub, tax = tax_amt, total = taxable + tax_amt where id = inv_id;
  return null;
end $$;

drop trigger if exists trg_recompute_invoice_totals_on_items on public.invoice_items;
create trigger trg_recompute_invoice_totals_on_items
  after insert or update or delete on public.invoice_items
  for each row execute function public.recompute_invoice_totals_on_items();

-- generate_invoice() no longer computes subtotal/tax/total itself — the
-- trigger above now owns that math (it fires as each item row is
-- inserted) — it only needs to persist the chosen tax_rate up front so
-- the trigger has something to compute against.
create or replace function public.generate_invoice(
  p_org uuid,
  p_client uuid,
  p_matter uuid default null,
  p_due_date date default null,
  p_tax_rate numeric default 0
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invoices;
begin
  if not public.has_financial_access(p_org, 'invoices.manage') then
    raise exception 'Not allowed to create invoices' using errcode = '42501';
  end if;

  insert into public.invoices (organization_id, client_id, matter_id, status, due_date, tax_rate, created_by)
  values (p_org, p_client, p_matter, 'draft', p_due_date, coalesce(p_tax_rate, 0), auth.uid())
  returning * into inv;

  -- Time entries -> items
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select t.organization_id, inv.id, 'time',
         coalesce(t.description, 'Legal services'),
         round(t.minutes / 60.0, 2), 'hrs', t.rate,
         round(t.minutes / 60.0 * t.rate, 2)
  from public.time_entries t
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (p_matter is not null and t.matter_id = p_matter
         or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client));

  update public.time_entries t set invoiced = true, invoice_id = inv.id
  where t.organization_id = p_org and t.billable and not t.invoiced
    and (p_matter is not null and t.matter_id = p_matter
         or p_matter is null and t.matter_id in (select id from public.matters where client_id = p_client));

  -- Expenses -> items
  insert into public.invoice_items (organization_id, invoice_id, kind, description, quantity, unit, rate, amount)
  select e.organization_id, inv.id, 'expense', coalesce(e.description, 'Expense'), 1, null, e.amount, e.amount
  from public.expenses e
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (p_matter is not null and e.matter_id = p_matter
         or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client));

  update public.expenses e set invoiced = true, invoice_id = inv.id
  where e.organization_id = p_org and e.billable and not e.invoiced
    and (p_matter is not null and e.matter_id = p_matter
         or p_matter is null and e.matter_id in (select id from public.matters where client_id = p_client));

  select * into inv from public.invoices where id = inv.id;

  perform public.log_audit(p_org, 'invoice.created', 'invoice', inv.id, 'Generated ' || inv.invoice_number);
  return inv;
end;
$$;

grant execute on function public.generate_invoice(uuid, uuid, uuid, date, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Payment recalculation: recognize "partial", and correctly revert
--    partial/paid back to sent when payments are removed down to zero
--    (today only handles the paid -> sent case).
-- ----------------------------------------------------------------------------
create or replace function public.recalc_invoice_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare inv uuid := coalesce(new.invoice_id, old.invoice_id); paid numeric; tot numeric; st public.invoice_status;
begin
  select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = inv;
  select total, status into tot, st from public.invoices where id = inv;
  update public.invoices
    set amount_paid = paid,
        status = case
          when st = 'void' then 'void'
          when tot > 0 and paid >= tot then 'paid'
          when paid > 0 and paid < tot then 'partial'
          when st in ('partial', 'paid') and paid <= 0 then 'sent'
          else st end
    where id = inv;
  return null;
end $$;
-- (trigger trg_recalc_invoice_payment already exists from 0016; replacing
-- the function body is enough, no need to recreate the trigger itself.)

-- Payments can only be recorded while an invoice is Sent or Partially Paid.
create or replace function public.guard_payment_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.invoice_status;
begin
  select status into st from public.invoices where id = new.invoice_id;
  if st is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if st not in ('sent', 'partial') then
    raise exception 'Payments can only be recorded on Sent or Partially Paid invoices' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_payment_invoice_status on public.payments;
create trigger trg_guard_payment_invoice_status
  before insert on public.payments
  for each row execute function public.guard_payment_invoice_status();

-- ----------------------------------------------------------------------------
-- 5. Invoice transition guard: lock line-item-adjacent fields once an
--    invoice leaves Draft, require at least one line item to Mark Sent,
--    and require a reason to Void — all as a real security boundary, not
--    just a UI affordance.
-- ----------------------------------------------------------------------------
create or replace function public.guard_invoice_transitions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'draft' and (
    new.due_date is distinct from old.due_date
    or new.discount is distinct from old.discount
    or new.tax_rate is distinct from old.tax_rate
    or new.notes is distinct from old.notes
  ) then
    raise exception 'This invoice is no longer a draft and cannot be edited' using errcode = '42501';
  end if;

  if old.status = 'draft' and new.status = 'sent' and not exists (
    select 1 from public.invoice_items where invoice_id = new.id
  ) then
    raise exception 'An invoice cannot be sent until it contains at least one billable item.' using errcode = '23514';
  end if;

  if new.status = 'void' and old.status is distinct from 'void' and coalesce(trim(new.void_reason), '') = '' then
    raise exception 'A reason is required to void an invoice' using errcode = '23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_invoice_transitions on public.invoices;
create trigger trg_guard_invoice_transitions
  before update on public.invoices
  for each row execute function public.guard_invoice_transitions();

-- ----------------------------------------------------------------------------
-- 6. Matter timeline entries for status changes, with the requested exact
--    wording for Sent and Void.
-- ----------------------------------------------------------------------------
create or replace function public.track_invoice_status_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_name text;
  client_name text;
  summary text;
begin
  if new.status is distinct from old.status and new.matter_id is not null then
    select full_name into actor_name from public.profiles where id = auth.uid();
    select display_name into client_name from public.clients where id = new.client_id;

    summary := case new.status
      when 'sent' then coalesce(actor_name, 'Someone') || ' sent Invoice ' || coalesce(new.invoice_number, '')
        || case when client_name is not null then ' to ' || client_name else '' end || '.'
      when 'void' then coalesce(actor_name, 'Someone') || ' voided Invoice ' || coalesce(new.invoice_number, '')
        || coalesce(chr(10) || 'Reason: ' || new.void_reason, '')
      when 'paid' then 'Invoice ' || coalesce(new.invoice_number, '') || ' was paid in full.'
      when 'partial' then 'Invoice ' || coalesce(new.invoice_number, '') || ' received a partial payment.'
      else coalesce(actor_name, 'Someone') || ' changed Invoice ' || coalesce(new.invoice_number, '') || ' status to ' || new.status
    end;

    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
    values (new.organization_id, new.matter_id, auth.uid(), 'invoice_status_changed', summary,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;

drop trigger if exists trg_track_invoice_status_changed on public.invoices;
create trigger trg_track_invoice_status_changed
  after update of status on public.invoices
  for each row execute function public.track_invoice_status_changed();

-- ----------------------------------------------------------------------------
-- 7. Delete Draft Invoice — draft-only, reverses linked time entries and
--    expenses back to Unbilled before deleting the invoice.
-- ----------------------------------------------------------------------------
create or replace function public.delete_draft_invoice(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice;
  if inv is null then
    raise exception 'Invoice not found' using errcode = '42704';
  end if;
  if inv.status <> 'draft' then
    raise exception 'Only draft invoices can be deleted' using errcode = '42501';
  end if;
  if not (public.has_financial_access(inv.organization_id, 'invoices.manage')
          and (inv.matter_id is null or public.has_matter_access(inv.matter_id))) then
    raise exception 'Not authorized to delete this invoice' using errcode = '42501';
  end if;

  update public.time_entries set invoiced = false, invoice_id = null, status = 'approved'
    where invoice_id = p_invoice;
  update public.expenses set invoiced = false, invoice_id = null
    where invoice_id = p_invoice;

  if inv.matter_id is not null then
    insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary)
    values (inv.organization_id, inv.matter_id, auth.uid(), 'invoice_deleted',
      'Deleted draft invoice ' || coalesce(inv.invoice_number, ''));
  end if;

  perform public.log_audit(inv.organization_id, 'invoice.deleted', 'invoice', inv.id,
    'Deleted draft invoice ' || coalesce(inv.invoice_number, ''));

  delete from public.invoices where id = p_invoice;
end;
$$;

grant execute on function public.delete_draft_invoice(uuid) to authenticated;
