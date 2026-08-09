import * as React from 'react'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { useSelectablePlans } from '@/features/onboarding/hooks/use-onboarding'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'
import type { Plan } from '@/shared/types/database.types'

function PlanCard({ plan, selected, onSelect }: { plan: Plan; selected: boolean; onSelect: () => void }) {
  const recommended = plan.key === 'professional'
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex flex-col rounded-xl border p-5 text-left transition-colors',
        selected ? 'border-primary bg-primary/5 shadow-card' : 'border-border hover:border-primary/40',
      )}
    >
      {recommended && (
        <Badge variant="default" className="absolute -top-2.5 right-4">Recommended</Badge>
      )}
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

/**
 * Onboarding Step 3 — plan selection + the trial-vs-subscribe fork (§2/§3).
 * Every price/limit shown comes straight from the plans table, never
 * hardcoded, so Platform Console plan edits show up here immediately.
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!plans || selectedId) return
    setSelectedId((plans.find((p) => p.key === 'professional') ?? plans[0])?.id ?? null)
  }, [plans, selectedId])

  if (isLoading || !plans) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full" />)}
      </div>
    )
  }

  const selected = plans.find((p) => p.id === selectedId) ?? null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} selected={plan.id === selectedId} onSelect={() => setSelectedId(plan.id)} />
        ))}
      </div>

      {selected?.is_custom ? (
        <Card className="p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Enterprise is tailored to your firm — users, storage, features, workflows, integrations and
            support are all custom.
          </p>
          <Button asChild size="lg" className="mt-4 w-full">
            <a href={`mailto:${APP.contactEmail}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
          </Button>
        </Card>
      ) : selected ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col p-5">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Start 30-day free trial
            </div>
            <p className="mt-1.5 flex-1 text-xs text-muted-foreground">
              Get full access to your selected plan for 30 days. No payment required to start.
            </p>
            <Button size="lg" className="mt-4 w-full" loading={trialLoading} onClick={() => onStartTrial(selected.id)}>
              Start Free Trial
            </Button>
          </Card>
          <Card className="flex flex-col p-5">
            <p className="text-sm font-semibold">Choose a paid plan</p>
            <p className="mt-1.5 flex-1 text-xs text-muted-foreground">
              Skip the trial and activate your firm's subscription immediately.
            </p>
            <Button size="lg" variant="outline" className="mt-4 w-full" loading={subscribeLoading} onClick={() => onSubscribeNow(selected.id)}>
              View Plans
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
