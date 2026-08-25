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
  async initTransaction(
    organizationId: string,
    planId: string,
    billingCycle: BillingCycle = 'monthly',
  ): Promise<InitTransactionResult> {
    return invokeEdgeFunction<InitTransactionResult>('paystack-init-transaction', {
      organizationId,
      planId,
      billingCycle,
      callbackUrl: `${window.location.origin}/subscription/callback`,
    })
  },
}
