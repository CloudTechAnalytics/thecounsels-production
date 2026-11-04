import * as React from 'react'
import { eachMonthOfInterval, format, startOfMonth, subMonths } from 'date-fns'
import { TrendingUp } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useReportData } from '@/features/reports/hooks/use-reports'
import type { DateRange } from '@/features/dashboard/hooks/use-date-range'
import { FirmActivityChart } from '@/features/dashboard/components/firm-activity-card'
import { TimeSeriesChart, type TimeSeriesPoint } from '@/shared/components/timeseries-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatMoneyCompact, formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Metric = 'revenue' | 'matters' | 'activity'
type Point = TimeSeriesPoint & { sub: string }

const METRICS: { key: Metric; label: string; blurb: string }[] = [
  { key: 'revenue', label: 'Revenue', blurb: 'Invoiced each month, last 12 months' },
  { key: 'matters', label: 'New matters', blurb: 'Matters opened each month, last 12 months' },
  { key: 'activity', label: 'Activity', blurb: 'Daily activity across matters, clients, billing and more' },
]

/** One measure at a time — revenue (₦) and matter counts never share an axis. */
export function PerformanceCard({ range, className }: { range: DateRange; className?: string }) {
  const { activeOrgId } = useAuth()
  const [metric, setMetric] = React.useState<Metric>('revenue')
  const from = React.useMemo(() => startOfMonth(subMonths(new Date(), 11)), [])
  const { data, isLoading } = useReportData(metric === 'activity' ? null : activeOrgId, { dateFrom: format(from, 'yyyy-MM-dd') })

  const points = React.useMemo<Point[]>(() => {
    const months = eachMonthOfInterval({ start: from, end: new Date() })
    return months.map((m) => {
      const key = format(m, 'yyyy-MM')
      if (metric === 'revenue') {
        const inv = (data?.invoices ?? []).filter((i) => i.issue_date?.startsWith(key) && i.status !== 'void' && i.status !== 'draft')
        const total = inv.reduce((s, i) => s + Number(i.total), 0)
        const paid = inv.reduce((s, i) => s + Number(i.amount_paid), 0)
        return { date: key, label: format(m, 'MMM yyyy'), value: total, sub: `${inv.length} invoice${inv.length === 1 ? '' : 's'} · ${formatNaira(paid)} collected` }
      }
      const opened = (data?.matters ?? []).filter((x) => x.opened_on?.startsWith(key))
      return { date: key, label: format(m, 'MMM yyyy'), value: opened.length, sub: `${opened.filter((x) => x.status === 'in_court').length} now in court` }
    })
  }, [data, metric, from])

  const current = METRICS.find((m) => m.key === metric)!
  const total = points.reduce((s, p) => s + p.value, 0)

  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-4 w-4 text-primary" /> Firm performance</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {current.blurb}
            {metric !== 'activity' && !isLoading && <> · <span className="font-medium text-foreground">{metric === 'revenue' ? formatMoneyCompact(total) : total} total</span></>}
          </p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5" role="tablist">
          {METRICS.map((m) => (
            <button
              key={m.key}
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', metric === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {metric === 'activity' ? (
          <FirmActivityChart range={range} />
        ) : isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <TimeSeriesChart
            data={points}
            formatValue={(n) => (metric === 'revenue' ? formatMoneyCompact(n) : String(n))}
            renderTooltip={(p) => (
              <div>
                <p className="text-xs text-muted-foreground">{p.label}</p>
                <p className="mt-0.5 font-display text-lg font-semibold">{metric === 'revenue' ? formatNaira(p.value) : `${p.value} matter${p.value === 1 ? '' : 's'} opened`}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.sub}</p>
              </div>
            )}
          />
        )}
      </CardContent>
    </Card>
  )
}
