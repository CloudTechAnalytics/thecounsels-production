-- ============================================================================
-- Migration 0094 — the Expenses tab has never actually worked: expenses.
-- invoice_id was declared as a bare `uuid` since 0016, with no real foreign
-- key to invoices. The frontend's EXP_SELECT embeds it as
-- `invoice:invoices(id, invoice_number)` (to show a "Billed · INV-xxxx"
-- badge) — without a real FK, PostgREST can't resolve that relationship at
-- all and the WHOLE query 400s, for every expense, for every user,
-- unconditionally. There was no error state anywhere on that query (same
-- class of silent failure as the log_audit and matter_assignments bugs
-- this session), so it just always rendered as an empty "No expenses
-- match this view" — confirmed live: a correctly-written, fully org/
-- matter/user-scoped expense row existed in the table and was invisible
-- to every single role, including Managing Partner.
--
-- time_entries.invoice_id has the exact same gap (same migration, same
-- missing constraint) — nothing currently embeds it, so it hasn't broken
-- anything yet, but it's the same latent bug and gets the same fix here
-- rather than waiting to be found the same way.
--
-- Defensive null-out first in case any invoice_id ever pointed at a
-- deleted invoice — the app's own void/delete-invoice logic already nulls
-- these out (0048), so this should be a no-op, but it's cheap insurance
-- against ADD CONSTRAINT failing on unexpectedly orphaned data.
-- ============================================================================

update public.expenses e
set invoice_id = null
where invoice_id is not null and not exists (select 1 from public.invoices i where i.id = e.invoice_id);

update public.time_entries t
set invoice_id = null
where invoice_id is not null and not exists (select 1 from public.invoices i where i.id = t.invoice_id);

alter table public.expenses
  add constraint expenses_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete set null;

alter table public.time_entries
  add constraint time_entries_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete set null;
