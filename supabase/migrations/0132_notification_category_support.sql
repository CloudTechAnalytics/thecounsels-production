-- ============================================================================
-- Migration 0132 — Add 'support' to notification_category.
--
-- Separate migration from 0133 (which actually uses it) on purpose — enum
-- value additions can't be used in the same transaction that adds them,
-- a rule this codebase already follows elsewhere. Needed for support
-- session request/grant/deny notifications (0133) — none of the existing
-- categories (matters, clients, hearings, billing, tasks, documents,
-- notes, messaging, hr, appointments) fit a support-access event.
-- ============================================================================

alter type public.notification_category add value 'support';
