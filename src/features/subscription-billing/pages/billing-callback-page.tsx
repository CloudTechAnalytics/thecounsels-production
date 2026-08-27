import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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
 *
 * context=existing (an already-authenticated user upgrading/resubscribing
 * mid-session, see paystack.service.ts's own comment) skips the forced
 * sign-out below and returns them straight to their workspace instead —
 * carrying an existing session forward through checkout is fine; it's
 * only a brand-new onboarding signup that has no real session yet to
 * carry. Getting this wrong was the actual cause of a real reported bug:
 * an existing user upgrading got forced through sign-out -> sign-in, and
 * briefly saw an empty workspace (zero clients/matters/members) during
 * that transition — the data was never gone, but the UX genuinely looked
 * like data loss right after a payment. context=onboarding (the default,
 * for the two call sites that predate this) keeps the original behavior.
 */
export function BillingCallbackPage() {
  const { activeOrgId, refresh, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isExistingUser = searchParams.get('context') === 'existing'
  const [elapsed, setElapsed] = React.useState(0)

  // Onboarding only — same "sign in fresh, don't just carry the session
  // forward" treatment the onboarding wizard's own welcome screen uses.
  const goToSignIn = async () => {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  const returnToWorkspace = () => navigate('/', { replace: true })

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
          isExistingUser ? (
            <>
              <h2 className="mt-6 font-display text-xl font-semibold">You're all set</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Your subscription is active. Taking you back to your workspace.
              </p>
              <Button size="lg" className="mt-8 w-full" onClick={returnToWorkspace}>
                Continue to workspace
              </Button>
            </>
          ) : (
            <>
              <h2 className="mt-6 font-display text-xl font-semibold">You're all set</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Your subscription is active. Sign in with your email and password to enter your workspace.
              </p>
              <Button size="lg" className="mt-8 w-full" onClick={goToSignIn}>
                Go to sign in
              </Button>
            </>
          )
        ) : timedOut ? (
          <>
            <h2 className="mt-6 font-display text-xl font-semibold">Still processing</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Your payment is still being confirmed. This can occasionally take a few minutes — sign
              in and check Firm Settings shortly, or reach out if this persists.
            </p>
            <Button variant="outline" size="lg" className="mt-8 w-full" onClick={goToSignIn}>
              Go to sign in
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
