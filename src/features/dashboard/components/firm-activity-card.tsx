import { Activity } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import type { DateRange } from '@/features/dashboard/hooks/use-date-range'
import { useFirmActivityTrend, type ActivityDay } from '@/features/dashboard/hooks/use-firm-activity-trend'
import { TimeSeriesChart } from '@/shared/components/timeseries-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

function ActivityTooltip({ day }: { day: ActivityDay }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{day.label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold">
        {day.total} {day.total === 1 ? 'Activity' : 'Activities'}
      </p>
      {day.breakdown.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {day.breakdown.map((b) => (
            <li key={b.key}>
              • {b.count} {b.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Managing Partner's "Firm Activity" chart — one total-per-day line, category breakdown in the hover tooltip. */
export function FirmActivityCard({ range }: { range: DateRange }) {
  const { activeOrgId } = useAuth()
  const { data, isLoading } = useFirmActivityTrend(activeOrgId, range)

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Firm Activity</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Daily activity across matters, clients, billing and more</p>
        </div>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !data || data.totalInRange === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">No firm activity has been recorded in the selected period.</p>
            <p className="mt-1 text-xs text-muted-foreground">Activity from matters, clients, hearings, billing and documents will appear here.</p>
          </div>
        ) : (
          <TimeSeriesChart
            data={data.days.map((d) => ({ date: d.date, label: d.label, value: d.total, day: d }))}
            renderTooltip={(p) => <ActivityTooltip day={p.day} />}
            formatValue={(n) => `${n}`}
          />
        )}
      </CardContent>
    </Card>
  )
}
