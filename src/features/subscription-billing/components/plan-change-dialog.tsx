import * as React from 'react'
import { Check } from 'lucide-react'
import { useSelectablePlans } from '@/features/onboarding/hooks/use-onboarding'
import { useScheduleDowngrade } from '@/features/administration/hooks/use-administration'
import { useStartCheckout } from '@/features/subscription-billing/hooks/use-paystack'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { BILLING_CYCLES, CYCLE_LABEL, CYCLE_SUFFIX, cyclePrice, cycleDiscountPercent } from '@/shared/lib/billing-cycle'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'
import { toast } from '@/shared/components/ui/sonner'
import type { BillingCycle, Plan } from '@/shared/types/database.types'

/**
 * "Upgrade plan" / "Change plan" from Plan & Billing. Also doubles as the
 * only place an org can switch billing cycle without changing tier — a
 * same-plan, different-cycle selection is treated the same as an upgrade
 * (pay now, at the new cycle's price). A cheaper tier never takes effect
 * immediately — it's scheduled for the current billing/trial period's end
 * (schedule_plan_downgrade RPC), applied later by the pg_cron job, carrying
 * whatever cycle was selected alongside it.
 */
export function PlanChangeDialog({
  open,
  onOpenChange,
  organizationId,
  currentPlan,
  currentCycle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  currentPlan: Plan | null
  currentCycle: BillingCycle
}) {
  const { data: plans, isLoading } = useSelectablePlans()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [cycle, setCycle] = React.useState<BillingCycle>(currentCycle)
  const checkout = useStartCheckout()
  const scheduleDowngrade = useScheduleDowngrade(organizationId)

  React.useEffect(() => {
    if (open) {
      setSelectedId(null)
      setCycle(currentCycle)
    }
  }, [open, currentCycle])

  const selected = plans?.find((p) => p.id === selectedId) ?? null
  const isSamePlan = selected?.id === currentPlan?.id
  const isUpgrade = !isSamePlan && !!selected && !!currentPlan && Number(selected.price_monthly) > Number(currentPlan.price_monthly)
  const isDowngrade = !isSamePlan && !!selected && !!currentPlan && Number(selected.price_monthly) < Number(currentPlan.price_monthly)
  const cycleOnlyChange = isSamePlan && cycle !== currentCycle
  const nothingChanged = isSamePlan && cycle === currentCycle
  const payNow = isUpgrade || cycleOnlyChange
  const pending = checkout.isPending || scheduleDowngrade.isPending

  const confirm = async () => {
    if (!selected) return
    try {
      if (payNow) {
        await checkout.mutateAsync({ organizationId, planId: selected.id, billingCycle: cycle }) // redirects to Paystack; never returns normally
      } else if (isDowngrade) {
        await scheduleDowngrade.mutateAsync({ planId: selected.id, billingCycle: cycle !== currentCycle ? cycle : undefined })
        toast.success(`Your plan will change to ${selected.name} on your next billing date.`)
        onOpenChange(false)
      }
    } catch (err) {
      toast.error('Could not change plan', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Upgrades (and cycle changes) take effect immediately after payment. Moving to a cheaper plan takes
            effect on your next billing date — nothing you've already paid for is removed early.
          </DialogDescription>
        </DialogHeader>

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

        {isLoading || !plans ? (
          <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => {
              const isCurrentPlan = plan.id === currentPlan?.id
              const discount = cycleDiscountPercent(cycle, plan)
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedId(plan.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                    plan.id === selectedId ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {plan.id === selectedId && <Check className="h-4 w-4 text-primary" />}
                    {plan.name}
                    {isCurrentPlan && <span className="text-xs font-normal text-muted-foreground">(current plan)</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {plan.is_custom ? 'Custom' : `${formatNaira(cyclePrice(cycle, plan))}${CYCLE_SUFFIX[cycle]}`}
                    {!plan.is_custom && discount != null && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        -{discount}%
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {selected?.is_custom ? (
            <Button asChild>
              <a href={`mailto:${APP.contactEmail}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
            </Button>
          ) : (
            <Button disabled={!selected || nothingChanged} loading={pending} onClick={confirm}>
              {payNow ? 'Pay & continue' : isDowngrade ? 'Schedule downgrade' : 'Continue'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
