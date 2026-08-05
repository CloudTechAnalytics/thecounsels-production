-- ============================================================================
-- Migration 0037 — Deleting a client now cascades to delete its matters.
--
-- matters.client_id was `on delete set null` — deleting a client silently
-- orphaned its matters (client link went blank, matter survived) with no
-- warning in the UI. Per explicit product decision: a deleted client should
-- take its matters with it.
--
-- This reuses the existing matter-deletion cascade rules exactly as they
-- already work when a matter is deleted directly from the Matters page —
-- documents/notes/timeline-events/hearings/team-assignments are hard
-- deleted (on delete cascade), while tasks/time_entries/expenses/invoices
-- are detached but preserved (on delete set null). No new cascade behavior
-- is introduced for those child tables; only the top-level
-- client -> matter link changes from "detach" to "cascade".
--
-- invoices.client_id (client-level invoices with no matter_id) is left
-- untouched — those are financial/billing records, a different category
-- from case files, and weren't part of this request.
--
-- Safety check: only managing_partner/partner/platform roles hold
-- clients.delete in the seed (0003) — the same roles that hold
-- matters.view_all by default (0030) — so this cascade introduces no
-- privilege escalation: nobody gains the ability to destroy a matter they
-- couldn't already fully see and manage.
-- ============================================================================

alter table public.matters drop constraint if exists matters_client_id_fkey;
alter table public.matters
  add constraint matters_client_id_fkey
  foreign key (client_id) references public.clients(id) on delete cascade;
