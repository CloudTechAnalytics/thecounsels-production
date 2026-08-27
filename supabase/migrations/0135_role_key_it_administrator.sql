-- ============================================================================
-- Migration 0135 — Add 'it_administrator' to role_key.
--
-- Separate migration from 0136 (which actually creates the role) on
-- purpose — enum value additions can't be used in the same transaction
-- that adds them, a rule this codebase already follows elsewhere (0132).
-- ============================================================================

alter type public.role_key add value 'it_administrator';
