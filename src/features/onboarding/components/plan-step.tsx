import * as React from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useRegistrationSettings, useSelectablePlans } from '@/features/onboarding/hooks/use-onboarding'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'
import type { Plan } from '@/shared/types/database.types'

const TRIAL = 'trial' as const
type Selection = typeof TRIAL | string

/** Set by the landing page's pricing CTAs (src/features/landing/pages/landing-page.tsx)
 * when someone clicks a specific paid tier there, so registering carries that
 * intent through the account-creation + email-verification gap — a query
 * param wouldn't survive Supabase's verification-link redirect. */
const INTENDED_PLAN_KEY = 'counsel.intended_plan'

function CardShell({
  selected,
  onSelect,
  badge,
  children,
}: {
  selected: boolean
  onSelect: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex flex-col rounded-xl border p-5 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 shadow-card' : 'border-border hover:border-primary/40',
      )}
    >
      {badge}
      {children}
      <span
        className={cn(
          'absolute right-4 top-4 flex h-4 w-4 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-border',
        )}
      >
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </span>
    </button>
  )
}

function TrialCard({ selected, onSelect, days }: { selected: boolean; onSelect: () => void; days: number }) {
  return (
    <CardShell
      selected={selected}
      onSelect={onSelect}
      badge={<Badge variant="secondary" className="absolute -top-2.5 right-4">No card required</Badge>}
    >
      <p className="flex items-center gap-1.5 font-display text-base font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> Trial
      </p>
      <p className="mt-1 font-display text-2xl font-semibold">
        Free<span className="text-sm font-normal text-muted-foreground"> · {days} days</span>
      </p>
      <ul className="mt-4 space-y-1.5">
        {['Full access, no limits', 'No payment required to start', 'Upgrade anytime from inside the app'].map((h) => (
          <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {h}
          </li>
        ))}
      </ul>
    </CardShell>
  )
}

function PlanCard({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  const recommended = plan.key === 'professional'
  return (
    <CardShell
      selected={selected}
      onSelect={onSelect}
      badge={recommended ? <Badge variant="default" className="absolute -top-2.5 right-4">Recommended</Badge> : undefined}
    >
      <p className="font-display text-base font-semibold">{plan.name}</p>
      {plan.is_custom ? (
        <p className="mt-1 font-display text-2xl font-semibold">Custom</p>
      ) : (
        <p className="mt-1 font-display text-2xl font-semibold">
          {formatNaira(Number(plan.price_monthly))}<span className="text-sm font-normal text-muted-foreground">/month</span>
        </p>
      )}
      {plan.is_custom && (
        <p className="text-xs text-muted-foreground">Starting from {formatNaira(Number(plan.price_monthly))}/month</p>
      )}
      <ul className="mt-4 space-y-1.5">
        {plan.highlights.slice(0, 4).map((h) => (
          <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {h}
          </li>
        ))}
      </ul>
    </CardShell>
  )
}

/**
 * Onboarding Step 3 — a single list of options (Trial first, then every
 * paid tier) with one Continue button, rather than a plan grid plus a
 * separate trial-vs-subscribe fork. Selecting Trial and continuing skips
 * payment entirely; selecting a paid tier and continuing goes straight to
 * Paystack checkout ("the payment section"). Every price/limit shown comes
 * straight from the plans table, never hardcoded.
 */
export function PlanStep({
  onStartTrial,
  onSubscribeNow,
  trialLoading,
  subscribeLoading,
}: {
  onStartTrial: (planId: string) => void
  onSubscribeNow: (planId: string) => void
  trialLoading: boolean
  subscribeLoading: boolean
}) {
  const { data: plans, isLoading } = useSelectablePlans()
  const { data: settings } = useRegistrationSettings()
  const [selected, setSelected] = React.useState<Selection | null>(null)

  // Trial is preselected by default — it's the recommended, no-payment path
  // — unless the landing page's pricing section pointed here with a
  // specific paid tier in mind, in which case that's what's preselected.
  React.useEffect(() => {
    if (!plans || selected) return
    const intendedKey = localStorage.getItem(INTENDED_PLAN_KEY)
    if (intendedKey) {
      localStorage.removeItem(INTENDED_PLAN_KEY)
      const match = plans.find((p) => p.key === intendedKey)
      if (match) {
        setSelected(match.id)
        return
      }
    }
    setSelected(TRIAL)
  }, [plans, selected])

  if (isLoading || !plans) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
      </div>
    )
  }

  const selectedPlan = selected && selected !== TRIAL ? plans.find((p) => p.id === selected) ?? null : null
  const trialDays = settings?.trial_duration_days ?? 30
  // What a Trial selection actually registers on — Platform-Console-configurable,
  // falling back to Professional (the recommended tier) if unset.
  const trialPlanId = settings?.trial_plan_id ?? plans.find((p) => p.key === 'professional')?.id ?? plans[0]?.id ?? null

  const handleContinue = () => {
    if (selected === TRIAL) {
      if (trialPlanId) onStartTrial(trialPlanId)
    } else if (selectedPlan) {
      onSubscribeNow(selectedPlan.id)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TrialCard selected={selected === TRIAL} onSelect={() => setSelected(TRIAL)} days={trialDays} />
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} selected={plan.id === selected} onSelect={() => setSelected(plan.id)} />
        ))}
      </div>

      {selectedPlan?.is_custom ? (
        <Card className="p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Enterprise is tailored to your firm — users, storage, features, workflows, integrations and
            support are all custom.
          </p>
          <Button asChild size="lg" className="mt-4 w-full">
            <a href={`mailto:${APP.contactEmail}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
          </Button>
        </Card>
      ) : (
        <Button
          size="lg"
          className="w-full"
          disabled={!selected}
          loading={selected === TRIAL ? trialLoading : subscribeLoading}
          onClick={handleContinue}
        >
          {selected === TRIAL ? 'Start Free Trial' : 'Continue'}
        </Button>
      )}
    </div>
  )
}
