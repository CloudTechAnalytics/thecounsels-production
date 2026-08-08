import { Clock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import type { DateRange } from '@/features/dashboard/hooks/use-date-range'
import { useBillableHoursTrend, type BillableHoursDay } from '@/features/dashboard/hooks/use-billable-hours-trend'
import { TimeSeriesChart } from '@/shared/components/timeseries-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

function HoursTooltip({ day }: { day: BillableHoursDay }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{day.label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold">{day.hours} Billable Hours</p>
      {day.matters.length > 0 && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{day.matters.length === 1 ? 'Matter:' : 'Matters:'}</span>
          <p className="mt-0.5">{day.matters.join(', ')}</p>
        </div>
      )}
    </div>
  )
}

/** Senior Associate's own "Billable Hours Trend" chart — more useful to an individual lawyer than a generic activity count. */
export function BillableHoursCard({ range }: { range: DateRange }) {
  const { activeOrgId, userId } = useAuth()
  const { data, isLoading } = useBillableHoursTrend(activeOrgId, userId, range)

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Billable Hours Trend</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Your daily billable hours logged</p>
        </div>
        <Clock className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !data || data.totalHours === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">Start logging billable hours to see your productivity trend.</p>
            <p className="mt-1 text-xs text-muted-foreground">Time you log against a matter will show up here, day by day.</p>
          </div>
        ) : (
          <TimeSeriesChart
            data={data.days.map((d) => ({ date: d.date, label: d.label, value: d.hours, day: d }))}
            renderTooltip={(p) => <HoursTooltip day={p.day} />}
            formatValue={(n) => `${n}h`}
          />
        )}
      </CardContent>
    </Card>
  )
}
