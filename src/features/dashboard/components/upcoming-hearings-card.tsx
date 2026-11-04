import * as React from 'react'
import { Link } from 'react-router-dom'
import { addDays, format, isToday, isTomorrow } from 'date-fns'
import { Gavel } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useHearings } from '@/features/hearings/hooks/use-hearings'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

/** The next week in court — the thing a law firm can least afford to miss. */
export function UpcomingHearingsCard({ branchId, className }: { branchId?: string | null; className?: string }) {
  const { activeOrgId } = useAuth()
  const range = React.useMemo(() => ({ from: new Date().toISOString(), to: addDays(new Date(), 7).toISOString() }), [])
  const { data, isLoading } = useHearings(activeOrgId, { status: 'scheduled', from: range.from, to: range.to, branchId: branchId ?? undefined })
  const rows = (data ?? []).slice(0, 5)

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><Gavel className="h-4 w-4 text-primary" /> Upcoming hearings</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Next 7 days</p>
        </div>
        <Link to="/hearings" className="text-xs text-primary hover:underline">View all</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No hearings in the next 7 days.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((h) => {
              const at = new Date(h.hearing_at)
              const soon = isToday(at) || isTomorrow(at)
              return (
                <li key={h.id}>
                  <Link to={h.matter ? `/matters/${h.matter.id}` : '/hearings'} className="flex items-center gap-3 hover:opacity-80">
                    <span className={cn('flex w-12 shrink-0 flex-col items-center rounded-lg border py-1 text-center', soon ? 'border-primary/50 bg-primary/10' : 'border-border')}>
                      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{format(at, 'EEE')}</span>
                      <span className="font-display text-base font-semibold leading-none">{format(at, 'd')}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{h.matter?.title ?? h.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {isToday(at) ? 'Today' : isTomorrow(at) ? 'Tomorrow' : format(at, 'MMM d')}, {format(at, 'h:mm a')}
                        {h.court ? ` · ${h.court}` : ''}
                        {h.assigned_lawyer?.full_name ? ` · ${h.assigned_lawyer.full_name}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
