-- ============================================================================
-- Migration 0068 — Track last payment date; fix next_billing_date staying
-- null on every real payment.
--
-- Paystack only sends next_payment_date on transactions tied to a
-- Paystack-managed recurring Subscription (requires plans.paystack_plan_code,
-- which has never actually been populated — see migration 0053's own
-- comment). Every checkout so far has been a one-time transaction, so this
-- field has always been absent, and paystack-webhook was writing that
-- absence straight into both next_billing_date AND current_period_end on
-- every successful charge — visible as "Next billing date: —" in Plan &
-- Billing even for an Active, paid subscription.
--
-- Fixed in paystack-webhook (Edge Function, redeploy required — see below):
-- it now computes next_billing_date itself from the org's own
-- billing_cycle (now + 1 month/year) whenever Paystack doesn't supply one,
-- and stamps last_payment_at so "last billing date" can be shown too.
-- ============================================================================

alter table public.subscriptions
  add column if not exists last_payment_at timestamptz;

-- One-time correction for subscriptions that are already 'active' (a real
-- payment already succeeded) but got left with next_billing_date/
-- current_period_end null by the bug above. Approximates last_payment_at
-- as updated_at (the closest available signal — this row was last touched
-- by that same activation) and derives next_billing_date from billing_cycle
-- the same way the fixed webhook now does going forward.
update public.subscriptions
set last_payment_at = coalesce(last_payment_at, updated_at),
    next_billing_date = coalesce(
      next_billing_date,
      case when billing_cycle = 'yearly'
        then coalesce(updated_at, now()) + interval '1 year'
        else coalesce(updated_at, now()) + interval '1 month'
      end
    ),
    current_period_end = coalesce(
      current_period_end,
      case when billing_cycle = 'yearly'
        then coalesce(updated_at, now()) + interval '1 year'
        else coalesce(updated_at, now()) + interval '1 month'
      end
    )
where status = 'active';
