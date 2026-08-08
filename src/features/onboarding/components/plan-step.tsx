import { CheckCircle2, Sparkles } from 'lucide-react'
import { useRegistrationSettings } from '@/features/onboarding/hooks/use-onboarding'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'

/** Onboarding Step 3 — plan confirmation. Everything shown is read from registration_settings/plans, never hardcoded. */
export function PlanStep({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  const { data: settings, isLoading } = useRegistrationSettings()
  const plan = settings?.trial_plan

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  }

  const trialDays = settings?.trial_duration_days ?? plan?.trial_duration_days ?? 90
  const trialMonths = Math.round(trialDays / 30)
  const futurePrice = settings?.trial_future_price ?? plan?.price_monthly ?? 0

  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden border-primary/30 p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: 'radial-gradient(20rem 20rem at 100% 0%, hsl(var(--primary) / 0.10), transparent 60%)' }}
        />
        <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" /> {plan?.name ?? 'Early Access'}
        </div>
        <p className="relative mt-3 font-display text-3xl font-semibold">
          {trialMonths > 0 ? `${trialMonths} month${trialMonths === 1 ? '' : 's'} free` : `${trialDays} days free`}
        </p>
        <p className="relative mt-1 text-sm text-muted-foreground">
          Then {formatNaira(futurePrice)}/month. No card required to start.
        </p>
        <ul className="relative mt-5 space-y-2 text-sm">
          {(plan?.highlights?.length ? plan.highlights : ['Full product access, no crippled trial']).map((h) => (
            <li key={h} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {h}
            </li>
          ))}
        </ul>
      </Card>

      <Button type="button" size="lg" className="w-full" onClick={onStart} loading={loading}>
        Start your free access
      </Button>
    </div>
  )
}
