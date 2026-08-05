-- ============================================================================
-- Migration 0029 — Primary contact person for corporate clients.
--
-- Corporate clients previously only had a single email/phone with no
-- indication of whose they were. Adds a distinct named contact (name, title,
-- email, phone) alongside the existing company-level email/phone — optional,
-- and equally usable for an individual client's secondary contact if ever
-- needed, though the UI only surfaces it for corporate.
-- ============================================================================

alter table public.clients
  add column if not exists contact_name text,
  add column if not exists contact_title text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;
