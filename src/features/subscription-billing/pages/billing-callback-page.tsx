import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { administrationService } from '@/features/administration/services/administration.service'
import { GetStartedShell } from '@/shared/components/get-started-shell'
import { Button } from '@/shared/components/ui/button'

const TIMEOUT_MS = 120_000
const POLL_MS = 3_000

/**
 * Paystack's redirect target after checkout. Never marks anything active
 * itself — purely polls until paystack-webhook (server-side, signature-
 * verified) has already flipped the subscription to 'active', then hands
 * off. If the webhook hasn't landed after ~2 minutes, says so plainly
 * rather than pretending success.
 */
export function BillingCallbackPage() {
  const { activeOrgId, refresh } = useAuth()
  const navigate = useNavigate()
  const [elapsed, setElapsed] = React.useState(0)

  const { data: subscription } = useQuery({
    queryKey: ['billing-callback-subscription', activeOrgId],
    queryFn: () => administrationService.getSubscription(activeOrgId!),
    enabled: Boolean(activeOrgId),
    refetchInterval: POLL_MS,
  })

  React.useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + POLL_MS), POLL_MS)
    return () => clearInterval(t)
  }, [])

  const active = subscription?.status === 'active'

  React.useEffect(() => {
    if (active) void refresh()
  }, [active, refresh])

  const timedOut = elapsed >= TIMEOUT_MS && !active

  return (
    <GetStartedShell stepLabel={active ? 'Payment confirmed' : 'Verifying your payment'} stepDescription={active ? undefined : 'This only takes a moment'}>
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          {active ? <CheckCircle2 className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
        </span>
        {active ? (
          <>
            <h2 className="mt-6 font-display text-xl font-semibold">You're all set</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Your subscription is active. Thanks for subscribing to The Counsel.
            </p>
            <Button size="lg" className="mt-8 w-full" onClick={() => navigate('/', { replace: true })}>
              Enter your workspace
            </Button>
          </>
        ) : timedOut ? (
          <>
            <h2 className="mt-6 font-display text-xl font-semibold">Still processing</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Your payment is still being confirmed. This can occasionally take a few minutes — check
              back shortly, or reach out if this persists.
            </p>
            <Button variant="outline" size="lg" className="mt-8 w-full" onClick={() => navigate('/', { replace: true })}>
              Go to workspace
            </Button>
          </>
        ) : (
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            We're confirming your payment with Paystack. Don't close this page.
          </p>
        )}
      </div>
    </GetStartedShell>
  )
}
