-- ============================================================================
-- Migration 0121 — Add 'quarterly' to the billing_cycle enum.
--
-- Split into its own migration on purpose: Postgres won't let a freshly-added
-- enum value be used in the same transaction that added it (same reason
-- 0072/0073 were split for role_key). 0122 depends on this having committed
-- first — run them in order, never combined.
-- ============================================================================

alter type public.billing_cycle add value if not exists 'quarterly' after 'monthly';
