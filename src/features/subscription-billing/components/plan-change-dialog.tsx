import * as React from 'react'
import { Check } from 'lucide-react'
import { useSelectablePlans } from '@/features/onboarding/hooks/use-onboarding'
import { useScheduleDowngrade } from '@/features/administration/hooks/use-administration'
import { useStartCheckout } from '@/features/subscription-billing/hooks/use-paystack'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'
import { toast } from '@/shared/components/ui/sonner'
import type { Plan } from '@/shared/types/database.types'

/**
 * "Upgrade plan" / "Change plan" from Plan & Billing. Upgrades re-run
 * Paystack checkout at the new plan's price (paystack-webhook switches
 * plan_id once payment is confirmed); downgrades never take effect
 * immediately — they're scheduled for the current billing/trial period's
 * end (schedule_plan_downgrade RPC), applied later by the pg_cron job.
 */
export function PlanChangeDialog({
  open,
  onOpenChange,
  organizationId,
  currentPlan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId: string
  currentPlan: Plan | null
}) {
  const { data: plans, isLoading } = useSelectablePlans()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const checkout = useStartCheckout()
  const scheduleDowngrade = useScheduleDowngrade(organizationId)

  React.useEffect(() => {
    if (!open) setSelectedId(null)
  }, [open])

  const selected = plans?.find((p) => p.id === selectedId) ?? null
  const isUpgrade = selected && currentPlan && Number(selected.price_monthly) > Number(currentPlan.price_monthly)
  const isDowngrade = selected && currentPlan && Number(selected.price_monthly) < Number(currentPlan.price_monthly)
  const pending = checkout.isPending || scheduleDowngrade.isPending

  const confirm = async () => {
    if (!selected) return
    try {
      if (isUpgrade) {
        await checkout.mutateAsync({ organizationId, planId: selected.id }) // redirects to Paystack; never returns normally
      } else if (isDowngrade) {
        await scheduleDowngrade.mutateAsync(selected.id)
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
            Upgrades take effect immediately after payment. Downgrades take effect on your next billing date —
            nothing you've already paid for is removed early.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !plans ? (
          <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentPlan?.id
              return (
                <button
                  key={plan.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => setSelectedId(plan.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                    isCurrent ? 'cursor-not-allowed border-border bg-muted/40 text-muted-foreground' :
                      plan.id === selectedId ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="flex items-center gap-2 font-medium">
                    {plan.id === selectedId && <Check className="h-4 w-4 text-primary" />}
                    {plan.name}
                    {isCurrent && <span className="text-xs font-normal text-muted-foreground">(current plan)</span>}
                  </span>
                  <span>{plan.is_custom ? 'Custom' : `${formatNaira(Number(plan.price_monthly))}/mo`}</span>
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
            <Button disabled={!selected} loading={pending} onClick={confirm}>
              {isUpgrade ? 'Upgrade & pay' : isDowngrade ? 'Schedule downgrade' : 'Continue'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
