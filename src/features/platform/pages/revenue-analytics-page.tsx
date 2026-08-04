import { TrendingUp, CircleDollarSign, Wallet, Users2, AlertTriangle, LineChart } from 'lucide-react'
import { useRevenueAnalytics } from '@/features/platform/hooks/use-platform'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { GrowthChart } from '@/features/platform/components/growth-chart'
import { BarChart, DistributionBars } from '@/shared/components/bar-chart'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { initialsOf, formatNaira, formatMoneyCompact } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

export function RevenueAnalyticsPage() {
  const { data, isLoading } = useRevenueAnalytics()

  return (
    <div>
      <PageHeader title="Revenue Analytics" description="Recurring-revenue movement, mix and forecast across the platform." />

      <div className="grid grid-flow-col auto-cols-[minmax(140px,1fr)] gap-4 overflow-x-auto pb-1">
        <KpiCard label="MRR" value={formatMoneyCompact(data?.mrr ?? 0)} hint="Monthly recurring" icon={TrendingUp} loading={isLoading} />
        <KpiCard label="ARR" value={formatMoneyCompact(data?.arr ?? 0)} hint="Annualised" icon={CircleDollarSign} loading={isLoading} />
        <KpiCard label="ARPA" value={formatMoneyCompact(data?.arpa ?? 0)} hint="Avg / account" icon={Wallet} loading={isLoading} />
        <KpiCard label="Paying" value={data?.payingCustomers ?? 0} hint="Active plans" icon={Users2} loading={isLoading} />
        <KpiCard label="At Risk" value={formatMoneyCompact(data?.atRisk ?? 0)} hint="Past-due MRR" icon={AlertTriangle} loading={isLoading} />
        <KpiCard label="Proj. ARR" value={formatMoneyCompact(data?.projectedArr ?? 0)} hint="6-mo forecast" icon={LineChart} loading={isLoading} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-1 text-sm font-semibold">MRR trend</h2>
        <p className="mb-4 text-xs text-muted-foreground">Reconstructed from subscription starts and cancellations.</p>
        {isLoading ? <Skeleton className="h-56 w-full" /> : <GrowthChart data={data?.trend ?? []} />}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">New MRR by month</h2>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <BarChart data={(data?.movement ?? []).map((m) => ({ label: m.label, value: Math.round(m.newMrr) }))} formatValue={(n) => formatMoneyCompact(n)} />
          )}
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Forecast · next 6 months</h2>
          {isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <BarChart data={data?.forecast ?? []} formatValue={(n) => formatMoneyCompact(n)} />
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Revenue by plan</h2>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : data && data.byPlan.length > 0 ? (
            <DistributionBars data={data.byPlan} formatValue={(n) => formatNaira(n)} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No active revenue yet.</p>
          )}
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Revenue by billing cycle</h2>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DistributionBars data={data?.byCycle ?? []} formatValue={(n) => formatNaira(n)} />
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">MRR movement</h2>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Churned</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.movement ?? []).map((m) => (
                  <TableRow key={m.label}>
                    <TableCell className="text-sm font-medium">{m.label}</TableCell>
                    <TableCell className="text-right text-sm text-success">+{formatNaira(Math.round(m.newMrr))}</TableCell>
                    <TableCell className="text-right text-sm text-destructive">{m.churnedMrr ? `−${formatNaira(Math.round(m.churnedMrr))}` : '—'}</TableCell>
                    <TableCell className={cn('text-right text-sm font-medium', m.netMrr < 0 ? 'text-destructive' : 'text-foreground')}>
                      {m.netMrr < 0 ? '−' : ''}{formatNaira(Math.abs(Math.round(m.netMrr)))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Top revenue customers</h2>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : data && data.topCustomers.length > 0 ? (
            <div className="space-y-3">
              {data.topCustomers.map((c) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-[10px] font-semibold text-primary">
                      {initialsOf(c.name, 'OR')}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.plan}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold">{formatNaira(Math.round(c.mrr))}/mo</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No paying customers yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
