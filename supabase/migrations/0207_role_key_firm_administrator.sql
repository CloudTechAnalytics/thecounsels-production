-- ============================================================================
-- Migration 0207 — Add 'firm_administrator' to role_key.
--
-- Separate from 0208 (which creates the role) because a new enum value can't
-- be used in the same transaction that adds it (same pattern as 0135/0136).
-- ============================================================================

alter type public.role_key add value if not exists 'firm_administrator';
