-- ============================================================================
-- Migration 0072 — Add 'litigation_clerk' to the role_key enum.
--
-- Split into its own migration, run and committed on its own, because
-- Postgres refuses to let a brand-new enum value be used in the same
-- transaction that added it ("unsafe use of new value... must be committed
-- before they can be used") — even within one pasted script, Supabase's SQL
-- editor runs everything as a single transaction. The role row and its
-- permission grants are in 0073, which must be run as a SEPARATE paste/run
-- after this one, not together with it.
-- ============================================================================

alter type public.role_key add value if not exists 'litigation_clerk';
