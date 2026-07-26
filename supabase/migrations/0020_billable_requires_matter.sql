-- ============================================================================
-- Migration 0020 — Billable work must be linked to a matter.
-- Invoices sweep unbilled work via the matter → client link, so a billable
-- entry with no matter can never be invoiced (it inflates WIP forever).
-- NOT VALID: existing orphaned rows are tolerated (the UI flags them);
-- all new/updated rows are enforced.
-- ============================================================================

alter table public.time_entries
  add constraint time_entries_billable_needs_matter
  check (not billable or matter_id is not null) not valid;

alter table public.expenses
  add constraint expenses_billable_needs_matter
  check (not billable or matter_id is not null) not valid;
