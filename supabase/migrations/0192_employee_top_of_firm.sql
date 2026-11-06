-- ============================================================================
-- Migration 0192 — "top of the firm": the one or two people (e.g. the
-- Managing Partner) who report to no one. Everyone else must have a line
-- manager; this flag is what lets the form tell the two apart.
-- ============================================================================
alter table public.employees add column if not exists reports_to_no_one boolean not null default false;
