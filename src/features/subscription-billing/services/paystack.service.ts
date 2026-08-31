import { invokeEdgeFunction } from '@/shared/lib/edge-function'
import type { BillingCycle } from '@/shared/types/database.types'

export interface InitTransactionResult {
  authorizationUrl: string
  reference: string
}

/**
 * Org-subscription Paystack checkout — distinct from the existing
 * src/features/billing/ (time entries/expenses/invoices/client payments).
 * Never marks anything "paid" itself; only paystack-webhook does that,
 * server-side, after verifying the event with Paystack.
 */
export const paystackService = {
  /** context distinguishes two very different situations the same
   * callback page has to handle: 'onboarding' (no real session yet — the
   * existing "sign in fresh" behavior is correct there) vs 'existing' (an
   * already-authenticated user upgrading or resubscribing mid-session, who
   * should just land back in their workspace, not get signed out). */
  async initTransaction(
    organizationId: string,
    planId: string,
    billingCycle: BillingCycle = 'monthly',
    context: 'onboarding' | 'existing' = 'onboarding',
    currency = 'NGN',
  ): Promise<InitTransactionResult> {
    return invokeEdgeFunction<InitTransactionResult>('paystack-init-transaction', {
      organizationId,
      planId,
      billingCycle,
      currency,
      callbackUrl: `${window.location.origin}/subscription/callback?context=${context}`,
    })
  },
}
