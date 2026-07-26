import * as React from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, format, isPast, isToday } from 'date-fns'
import { BellRing, Activity, Gavel, CheckSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useLiveActivity } from '@/features/notifications/hooks/use-live-activity'
import { useHearings } from '@/features/hearings/hooks/use-hearings'
import { useTasks } from '@/features/tasks/hooks/use-tasks'
import { PageHeader } from '@/shared/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import { titleCase } from '@/shared/lib/format'

interface Reminder {
  id: string
  kind: 'hearing' | 'task'
  title: string
  date: Date
  href?: string
}

export function NotificationsPage() {
  const { activeOrgId, profile } = useAuth()
  const { data: activity, isLoading, live } = useLiveActivity(activeOrgId)

  // Stable 14-day window: recomputing `new Date()` each render would change the
  // query key every render and the hearings query would never settle.
  const { from, to } = React.useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 14)
    end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }, [])
  const in14 = new Date(to)
  const { data: hearings } = useHearings(activeOrgId, { from, to, status: 'scheduled' })
  const { data: tasks } = useTasks(activeOrgId, { status: 'all', assigneeId: 'all' }, profile?.id ?? null)

  const reminders: Reminder[] = [
    ...(hearings ?? []).map((h) => ({
      id: `h-${h.id}`,
      kind: 'hearing' as const,
      title: h.title,
      date: new Date(h.hearing_at),
      href: h.matter ? `/matters/${h.matter.id}` : '/hearings',
    })),
    ...(tasks ?? [])
      .filter((t) => t.status !== 'done' && t.due_date)
      .map((t) => ({
        id: `t-${t.id}`,
        kind: 'task' as const,
        title: t.title,
        date: new Date(t.due_date + 'T09:00:00'),
        href: t.matter ? `/matters/${t.matter.id}` : '/tasks',
      })),
  ]
    .filter((r) => r.date <= in14)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <div>
      <PageHeader title="Notifications" description="Reminders and a live feed of everything happening at your firm." />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Reminders — actionable, populated as hearings & tasks land */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Reminders</CardTitle>
            <BellRing className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {reminders.length > 0 ? (
              <ul className="space-y-2">
                {reminders.map((r) => {
                  const overdue = isPast(r.date) && !isToday(r.date)
                  return (
                    <li key={r.id}>
                      <Link to={r.href ?? '#'} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 hover:border-primary/40">
                        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {r.kind === 'hearing' ? <Gavel className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.title}</p>
                          <p className={cn('text-xs', overdue ? 'font-medium text-destructive' : isToday(r.date) ? 'font-medium text-primary' : 'text-muted-foreground')}>
                            {overdue ? 'Overdue · ' : isToday(r.date) ? 'Today · ' : ''}
                            {format(r.date, r.kind === 'hearing' ? 'MMM d, HH:mm' : 'MMM d')}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize">{r.kind}</Badge>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">You're all caught up</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upcoming hearings and task deadlines (next 14 days) will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live activity feed */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              Activity
              <span className="inline-flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-success' : 'bg-muted-foreground/40'}`} />
                {live ? 'Live' : 'Connecting…'}
              </span>
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/3" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activity && activity.length > 0 ? (
              <ul className="divide-y divide-border/70">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                      {titleCase(entry.action.split('.')[0]).slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.summary ?? titleCase(entry.action.replace(/\./g, ' '))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant="muted">{entry.action.split('.')[0]}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">No activity yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Actions across your firm will appear here in real time as your team gets to work.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
