import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, LockKeyhole, LogOut } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useSubscription } from '@/features/administration/hooks/use-administration'
import { useSelectablePlans } from '@/features/onboarding/hooks/use-onboarding'
import { useStartCheckout } from '@/features/subscription-billing/hooks/use-paystack'
import { GetStartedShell } from '@/shared/components/get-started-shell'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'
import { BILLING_CYCLES, CYCLE_LABEL, CYCLE_SUFFIX, cyclePrice, cycleDiscountPercent } from '@/shared/lib/billing-cycle'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'
import { toast } from '@/shared/components/ui/sonner'
import type { BillingCycle } from '@/shared/types/database.types'

// RequireActiveSubscription sends expired/suspended/paused here alike, but
// they mean genuinely different things. 'expired' is a trial that ran out
// without ever picking a plan — self-serve checkout is exactly the right
// next step. 'suspended'/'paused', on the other hand, are a platform admin
// deliberately holding back access on an ALREADY-EXISTING subscription —
// the plan itself is still there, nothing lapsed. Showing pricing cards
// and a "pick a plan and pay" flow for those two was wrong on two counts:
// confusing copy ("Your free trial has ended" for a paying org), and worse,
// it let anyone with organization.manage pay their way straight past an
// admin's hold — completely bypassing why it was paused/suspended in the
// first place. Only 'expired' gets the plan-selection flow now; the other
// two get a plain "this needs a platform admin" message, same for everyone
// regardless of organization.manage, since nobody in the firm can actually
// self-serve their way out of an admin hold.
const ADMIN_HOLD_COPY: Record<string, { stepLabel: string; heading: string; body: string }> = {
  paused: {
    stepLabel: 'Workspace paused',
    heading: "Your firm's workspace is paused",
    body: 'Your plan is still in place — access has just been temporarily paused. Reach out to us to resume it.',
  },
  suspended: {
    stepLabel: 'Workspace suspended',
    heading: "Your firm's workspace has been suspended",
    body: 'Reach out to us to find out why and get access restored.',
  },
}

/**
 * Forced stop for an expired/suspended/paused organization
 * (RequireActiveSubscription). Everyone in the firm is blocked from the
 * workspace — only organization.manage holders see payment controls here
 * (§14: Senior Associates never administer billing), matching every other
 * org-scoped forced-stop screen in this app.
 */
export function ExpiredSubscriptionPage() {
  const { activeMembership, signOut } = useAuth()
  const { has } = usePermissions()
  const navigate = useNavigate()
  const canManage = has('organization.manage')
  const orgId = activeMembership?.organization_id ?? null
  const { data: sub } = useSubscription(orgId)
  const holdCopy = sub?.status ? ADMIN_HOLD_COPY[sub.status] : undefined
  const { data: plans, isLoading } = useSelectablePlans()
  const checkout = useStartCheckout()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [cycle, setCycle] = React.useState<BillingCycle>('monthly')

  // The one way out of this screen. A plain <Link to="/"> (GetStartedShell's
  // default logo behavior) does nothing useful here: an authenticated user
  // hitting "/" doesn't see the landing page, they just get bounced straight
  // back to this exact screen by RequireActiveSubscription — the logo looked
  // clickable but silently went nowhere, and there was no sign-out control
  // on this page at all, so a locked-out user had no way to leave it. Real
  // reported bug: both the logo and (missing) sign out did nothing. Goes to
  // /auth/login specifically, not "/" — signing out of a locked workspace
  // means wanting back in (possibly as someone else), not the marketing page.
  const leave = async () => {
    await signOut()
    navigate('/auth/login', { replace: true })
  }
  const signOutButton = (
    <Button variant="ghost" size="sm" onClick={leave} className="gap-1.5 text-muted-foreground">
      <LogOut className="h-4 w-4" /> Sign out
    </Button>
  )

  const subscribe = async (planId: string) => {
    if (!orgId) return
    try {
      await checkout.mutateAsync({ organizationId: orgId, planId, billingCycle: cycle, context: 'existing' })
    } catch (err) {
      toast.error('Could not start checkout', { description: err instanceof Error ? err.message : undefined })
    }
  }

  // Admin hold (paused/suspended): no pricing, no checkout — nothing here
  // is self-serve, so everyone in the firm sees the same plain message.
  if (holdCopy) {
    return (
      <GetStartedShell title={APP.product} stepLabel={holdCopy.stepLabel} onLogoClick={leave} headerEnd={signOutButton}>
        <div className="flex flex-col items-center py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <LockKeyhole className="h-8 w-8" />
          </span>
          <h2 className="mt-6 font-display text-xl font-semibold">{holdCopy.heading}</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">{holdCopy.body}</p>
          <Button asChild size="lg" className="mt-8 w-full">
            <a href={`mailto:${APP.contactEmail}?subject=The Counsel — ${holdCopy.stepLabel}`}>Contact us</a>
          </Button>
        </div>
      </GetStartedShell>
    )
  }

  if (!canManage) {
    return (
      <GetStartedShell title={APP.product} stepLabel="Trial ended" onLogoClick={leave} headerEnd={signOutButton}>
        <div className="flex flex-col items-center py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <LockKeyhole className="h-8 w-8" />
          </span>
          <h2 className="mt-6 font-display text-xl font-semibold">Your firm's trial has ended</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Ask your Managing Partner to choose a plan to continue using {APP.product}.
          </p>
        </div>
      </GetStartedShell>
    )
  }

  return (
    <GetStartedShell
      title={APP.product}
      stepLabel="Your free trial has ended"
      stepDescription={`Choose a plan to continue using ${APP.product}`}
      onLogoClick={leave}
      headerEnd={signOutButton}
    >
      {isLoading || !plans ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
              {BILLING_CYCLES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    cycle === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {CYCLE_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {plans.map((plan) => {
              const discount = cycleDiscountPercent(cycle, plan)
              return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                className={cn(
                  'relative flex flex-col rounded-xl border p-5 text-left transition-colors',
                  selectedId === plan.id ? 'border-primary bg-primary/5 shadow-card' : 'border-border hover:border-primary/40',
                )}
              >
                {plan.key === 'professional' && <Badge variant="default" className="absolute -top-2.5 right-4">Recommended</Badge>}
                <p className="font-display text-base font-semibold">{plan.name}</p>
                <p className="mt-1 font-display text-2xl font-semibold">
                  {plan.is_custom ? 'Custom' : (
                    <>{formatNaira(cyclePrice(cycle, plan))}<span className="text-sm font-normal text-muted-foreground">{CYCLE_SUFFIX[cycle]}</span></>
                  )}
                </p>
                {!plan.is_custom && discount != null && (
                  <Badge variant="secondary" className="mt-1 w-fit">Save {discount}%</Badge>
                )}
                <ul className="mt-4 space-y-1.5">
                  {plan.highlights.slice(0, 4).map((h) => (
                    <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {h}
                    </li>
                  ))}
                </ul>
              </button>
              )
            })}
          </div>

          {selectedId && (
            plans.find((p) => p.id === selectedId)?.is_custom ? (
              <Button asChild size="lg" className="w-full">
                <a href={`mailto:${APP.contactEmail}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
              </Button>
            ) : (
              <Button size="lg" className="w-full" loading={checkout.isPending} onClick={() => subscribe(selectedId)}>
                Subscribe now
              </Button>
            )
          )}
        </div>
      )}
    </GetStartedShell>
  )
}
