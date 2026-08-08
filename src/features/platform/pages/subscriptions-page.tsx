import { CreditCard, TrendingUp, CircleDollarSign, Building2, Hourglass } from 'lucide-react'
import {
  usePlans,
  useSubscriptions,
  useUpdateSubscription,
  usePlatformStats,
} from '@/features/platform/hooks/use-platform'
import type { SubscriptionRow } from '@/features/platform/types'
import type { SubscriptionStatus } from '@/shared/types/database.types'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { initialsOf, formatNaira, formatMoneyCompact, daysUntil } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trialing', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
]

function monthlyPrice(row: SubscriptionRow): number {
  if (!row.plan) return 0
  return row.billing_cycle === 'yearly' ? Number(row.plan.price_yearly) / 12 : Number(row.plan.price_monthly)
}

function SubscriptionRowItem({ row }: { row: SubscriptionRow }) {
  const { data: plans } = usePlans()
  const update = useUpdateSubscription()
  const trialLeft = row.status === 'trialing' ? daysUntil(row.trial_ends_at) : null

  const change = async (patch: Parameters<typeof update.mutateAsync>[0]['patch'], action: string, ok: string) => {
    try {
      await update.mutateAsync({ id: row.id, orgId: row.organization_id, action, patch })
      toast.success(ok)
    } catch (err) {
      toast.error('Update failed', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-[10px] font-semibold text-primary">
            {initialsOf(row.organization?.name, 'OR')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.organization?.name ?? '—'}</p>
            <p className="truncate text-xs text-muted-foreground">/{row.organization?.slug}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Select
          value={row.plan_id ?? undefined}
          onValueChange={(v) => change({ plan_id: v }, 'plan_changed', 'Plan updated')}
        >
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder="No plan" />
          </SelectTrigger>
          <SelectContent>
            {plans
              ?.filter((p) => p.is_active)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatNaira(Number(p.price_monthly))}/mo
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <Select
            value={row.status}
            onValueChange={(v) => change({ status: v as SubscriptionStatus }, `status_${v}`, 'Status updated')}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {trialLeft != null && (
            <p className="pl-1 text-xs text-muted-foreground">{trialLeft < 0 ? 'Expired' : `${trialLeft}d left`}</p>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.seats}</TableCell>
      <TableCell className="text-right text-sm font-medium">{formatNaira(monthlyPrice(row))}</TableCell>
    </TableRow>
  )
}

export function SubscriptionsPage() {
  const { data, isLoading } = useSubscriptions()
  const stats = usePlatformStats()
  const trials = (data ?? []).filter((s) => s.status === 'trialing').length

  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description="Assign plans to customer organizations. Revenue is computed from active plans."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="MRR" value={formatMoneyCompact(stats.data?.mrr ?? 0)} hint="Monthly recurring revenue" icon={TrendingUp} loading={stats.isLoading} />
        <KpiCard label="ARR" value={formatMoneyCompact(stats.data?.arr ?? 0)} hint="Annualised" icon={CircleDollarSign} loading={stats.isLoading} />
        <KpiCard label="Customers" value={data?.length ?? 0} hint="Paying + trial tenants" icon={Building2} loading={isLoading} />
        <KpiCard label="Trials" value={trials} hint="Not yet billing" icon={Hourglass} loading={isLoading} />
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <CreditCard className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer plans</h2>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <SubscriptionRowItem key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            No subscriptions yet — they're created automatically with each organization.
          </div>
        )}
      </Card>
    </div>
  )
}
