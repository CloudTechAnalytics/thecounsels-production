-- ============================================================================
-- Migration 0147 — Expand the matter lifecycle with two universally-useful
-- stages, additive to what already exists (mirrors how 'appeal' was added
-- in 0064). Confirmed with the user: not the full 7-stage litigation-shaped
-- pipeline they first proposed (Court Proceedings/Awaiting Judgment don't
-- generalize to Corporate & Commercial, Real Estate, Tax, IP, Immigration,
-- Banking & Finance matters, and are already tracked more precisely via
-- Hearings for the matters that need that granularity) — just the two
-- ideas from it that apply to every practice area:
--
--   - under_review: a real intake/conflict-check phase before work
--     formally begins.
--   - resolved: the substantive outcome is reached (settlement, deal
--     completed, judgment obtained, application approved) — distinct from
--     'closed', which stays administrative wrap-up/archival. Deliberately
--     NOT added to matter_is_open()'s closed set below — a closing letter
--     or final invoice is normal work to do right after a matter resolves,
--     so it stays fully read-write like 'open' until actually Closed.
--
-- New lifecycle: open -> under_review -> in_court -> appeal -> resolved -> closed.
-- New values only — no data migration needed, nothing existing changes.
-- ============================================================================

alter type public.matter_status add value if not exists 'under_review';
alter type public.matter_status add value if not exists 'resolved';
