import { useMutation } from '@tanstack/react-query'
import { paystackService } from '@/features/subscription-billing/services/paystack.service'
import { env } from '@/shared/config/env'
import type { BillingCycle } from '@/shared/types/database.types'

/**
 * Starts a Paystack checkout and redirects the whole page there — never
 * resolves normally on success, since the browser navigates away.
 */
export function useStartCheckout() {
  return useMutation({
    mutationFn: async ({
      organizationId,
      planId,
      billingCycle = 'monthly',
      context = 'onboarding',
      currency = 'NGN',
    }: {
      organizationId: string
      planId: string
      billingCycle?: BillingCycle
      /** See paystackService.initTransaction's own comment. */
      context?: 'onboarding' | 'existing'
      currency?: string
    }) => {
      if (!env.isPaystackConfigured) {
        throw new Error('Payment integration is not configured yet — contact support.')
      }
      const { authorizationUrl } = await paystackService.initTransaction(organizationId, planId, billingCycle, context, currency)
      window.location.href = authorizationUrl
    },
  })
}
