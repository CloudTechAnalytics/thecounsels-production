-- ============================================================================
-- Migration 0032 — Make trg_grant_matter_creator_access safe to re-run.
--
-- Every other new trigger added in 0030 has a `drop trigger if exists` guard
-- before it (matching this codebase's established idempotent-migration
-- pattern, e.g. 0022's fix for the same class of bug); this one was missed.
-- Postgres has no `CREATE TRIGGER IF NOT EXISTS`, so if 0030 was ever applied
-- more than once against the same database (a partial-failure retry, or a
-- second manual paste into the SQL editor), the second run would fail with
-- "trigger already exists" on this exact statement and abort.
-- ============================================================================

drop trigger if exists trg_grant_matter_creator_access on public.matters;
create trigger trg_grant_matter_creator_access
  after insert on public.matters
  for each row execute function public.grant_matter_creator_access();
