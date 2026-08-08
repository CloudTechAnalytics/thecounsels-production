-- ============================================================================
-- Migration 0048 — Expense management overhaul.
--
-- Blueprint: 0024_time_entries_overhaul.sql already solved this exact shape
-- of problem for time entries (created_by/updated_by + actor trigger,
-- is_partner_or_above() for a lock-override, split "for all" RLS into
-- per-action policies with a lock condition). This replicates that pattern
-- for expenses rather than inventing a new one. is_partner_or_above()
-- already exists from 0024 and is reused verbatim, unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Audit columns — organization_id/matter_id already exist on expenses;
--    only created_by/updated_by are missing.
-- ----------------------------------------------------------------------------
alter table public.expenses
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

update public.expenses set created_by = user_id, updated_by = user_id where created_by is null;

-- ----------------------------------------------------------------------------
-- 2. Trusted server-side actor stamping — not from client input, so "Logged
--    By" can't be spoofed by a disabled form field alone.
-- ----------------------------------------------------------------------------
create or replace function public.track_expense_actor()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_by := coalesce(new.updated_by, new.created_by);
  elsif tg_op = 'UPDATE' then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_expenses_actor on public.expenses;
create trigger trg_expenses_actor
  before insert or update on public.expenses
  for each row execute function public.track_expense_actor();

-- ----------------------------------------------------------------------------
-- 3. Lock invoiced expenses — split the single "for all" policy so the lock
--    only constrains update/delete (a brand-new row is never locked), same
--    shape as time_entries_update/time_entries_delete in 0024. Today there
--    is zero enforcement of this anywhere (an owner can currently edit or
--    delete their own already-invoiced expense).
-- ----------------------------------------------------------------------------
drop policy if exists "expenses_write" on public.expenses;

create policy "expenses_insert" on public.expenses
  for insert
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
  );

create policy "expenses_update" on public.expenses
  for update
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  )
  with check (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

create policy "expenses_delete" on public.expenses
  for delete
  using (
    (matter_id is null or public.has_matter_access(matter_id))
    and (public.has_permission(organization_id, 'expenses.manage') or user_id = auth.uid())
    and (not invoiced or public.is_partner_or_above(organization_id))
  );

-- ----------------------------------------------------------------------------
-- 4. Activity Timeline — expenses have never written to matter_events (only
--    to audit_logs, the firm-wide log, via the service layer). New triggers,
--    same style as track_document_added/track_time_entry_actor's siblings.
-- ----------------------------------------------------------------------------
create or replace function public.track_expense_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = coalesce(new.created_by, auth.uid());
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, coalesce(new.created_by, auth.uid()), 'expense_created',
    coalesce(actor_name, 'Someone') || ' logged an expense: ₦' || new.amount || ' — ' || new.description,
    jsonb_build_object('expense_id', new.id, 'amount', new.amount));
  return new;
end $$;

drop trigger if exists trg_track_expense_created on public.expenses;
create trigger trg_track_expense_created
  after insert on public.expenses
  for each row execute function public.track_expense_created();

create or replace function public.track_expense_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.matter_id is null then return new; end if;
  -- Skip when nothing a person would call "an edit" changed — e.g. the
  -- invoiced/invoice_id flip generate_invoice() makes gets its own,
  -- differently-worded event via track_expense_invoiced below.
  if new.amount is not distinct from old.amount
     and new.description is not distinct from old.description
     and new.category is not distinct from old.category
     and new.expense_date is not distinct from old.expense_date
     and new.matter_id is not distinct from old.matter_id
     and new.billable is not distinct from old.billable then
    return new;
  end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (
    new.organization_id, new.matter_id, auth.uid(), 'expense_updated',
    case when new.amount is distinct from old.amount
      then coalesce(actor_name, 'Someone') || ' updated an expense — amount changed from ₦' || old.amount || ' to ₦' || new.amount
      else coalesce(actor_name, 'Someone') || ' updated an expense: ' || new.description
    end,
    jsonb_build_object('expense_id', new.id, 'from_amount', old.amount, 'to_amount', new.amount));
  return new;
end $$;

drop trigger if exists trg_track_expense_updated on public.expenses;
create trigger trg_track_expense_updated
  after update on public.expenses
  for each row execute function public.track_expense_updated();

-- Cascade-guarded the same way 0028/0033/0047 already established for this
-- exact class of bug (deleting the parent matter/org cascades here too).
create or replace function public.track_expense_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if old.matter_id is null then return old; end if;
  if not exists (select 1 from public.organizations where id = old.organization_id)
     or not exists (select 1 from public.matters where id = old.matter_id) then
    return old;
  end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (old.organization_id, old.matter_id, auth.uid(), 'expense_deleted',
    coalesce(actor_name, 'Someone') || ' deleted an expense: ₦' || old.amount || ' — ' || old.description,
    jsonb_build_object('expense_id', old.id, 'amount', old.amount));
  return old;
end $$;

drop trigger if exists trg_track_expense_deleted on public.expenses;
create trigger trg_track_expense_deleted
  after delete on public.expenses
  for each row execute function public.track_expense_deleted();

-- Fires when generate_invoice()'s expense sweep sets invoiced = true —
-- untouched itself; this rides its existing UPDATE.
create or replace function public.track_expense_invoiced()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; inv_number text;
begin
  if new.matter_id is null or not new.invoiced or old.invoiced then return new; end if;
  select full_name into actor_name from public.profiles where id = auth.uid();
  select invoice_number into inv_number from public.invoices where id = new.invoice_id;
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, new.matter_id, auth.uid(), 'expense_invoiced',
    coalesce(actor_name, 'Someone') || ' included the expense ₦' || new.amount || ' — ' || new.description
      || ' in Invoice ' || coalesce(inv_number, ''),
    jsonb_build_object('expense_id', new.id, 'invoice_id', new.invoice_id));
  return new;
end $$;

drop trigger if exists trg_track_expense_invoiced on public.expenses;
create trigger trg_track_expense_invoiced
  after update of invoiced on public.expenses
  for each row execute function public.track_expense_invoiced();

-- ----------------------------------------------------------------------------
-- 5. Void an invoice ⇒ its expenses/time entries become unbilled again, same
--    as hard-deleting one already does (delete_invoice, 0046). Today only
--    delete reverses invoiced/invoice_id; void leaves them billed forever.
--    Scoped tightly to the void transition — sent/partial/paid flows are
--    untouched.
-- ----------------------------------------------------------------------------
create or replace function public.reverse_billing_on_void()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    update public.expenses set invoiced = false, invoice_id = null where invoice_id = new.id;
    update public.time_entries set invoiced = false, invoice_id = null, status = 'approved'
      where invoice_id = new.id and status in ('invoiced', 'paid');
  end if;
  return new;
end $$;

drop trigger if exists trg_reverse_billing_on_void on public.invoices;
create trigger trg_reverse_billing_on_void
  after update of status on public.invoices
  for each row execute function public.reverse_billing_on_void();

-- ----------------------------------------------------------------------------
-- 6. Receipts — a table (not bare columns on expenses), so "replace" is
--    naturally insert-new+delete-old with history inspectable, mirroring why
--    documents is its own table rather than a column on matters. Bucket +
--    RLS clone the `documents` bucket's exact shape (private, org-folder
--    check, matter-access join-through for select).
-- ----------------------------------------------------------------------------
create table public.expense_receipts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_id      uuid not null references public.expenses(id) on delete cascade,
  storage_path    text not null,
  file_name       text not null,
  mime_type       text,
  size_bytes      bigint,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_expense_receipts_expense on public.expense_receipts (expense_id);

alter table public.expense_receipts enable row level security;

create policy "expense_receipts_select" on public.expense_receipts
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'billing.view') or e.user_id = auth.uid())
    )
  );

create policy "expense_receipts_insert" on public.expense_receipts
  for insert with check (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and not e.invoiced
    )
  );

create policy "expense_receipts_delete" on public.expense_receipts
  for delete using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and (not e.invoiced or public.is_partner_or_above(e.organization_id))
    )
  );

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts_storage_select" on storage.objects
  for select using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.storage_path = name
        and (e.matter_id is null or public.has_matter_access(e.matter_id))
        and (public.has_permission(e.organization_id, 'billing.view') or e.user_id = auth.uid())
    )
  );

create policy "receipts_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'receipts'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'billing.view')
  );

create policy "receipts_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.expense_receipts r
      join public.expenses e on e.id = r.expense_id
      where r.storage_path = name
        and (public.has_permission(e.organization_id, 'expenses.manage') or e.user_id = auth.uid())
        and (not e.invoiced or public.is_partner_or_above(e.organization_id))
    )
  );

create or replace function public.track_receipt_uploaded()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text; m_id uuid;
begin
  select matter_id into m_id from public.expenses where id = new.expense_id;
  if m_id is null then return new; end if;
  select full_name into actor_name from public.profiles where id = coalesce(new.uploaded_by, auth.uid());
  insert into public.matter_events (organization_id, matter_id, actor_id, kind, summary, metadata)
  values (new.organization_id, m_id, coalesce(new.uploaded_by, auth.uid()), 'receipt_uploaded',
    coalesce(actor_name, 'Someone') || ' uploaded a receipt: ' || new.file_name,
    jsonb_build_object('expense_id', new.expense_id, 'receipt_id', new.id));
  return new;
end $$;

drop trigger if exists trg_track_receipt_uploaded on public.expense_receipts;
create trigger trg_track_receipt_uploaded
  after insert on public.expense_receipts
  for each row execute function public.track_receipt_uploaded();
