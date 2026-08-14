import * as React from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isToday, addMonths, format,
} from 'date-fns'
import { Users, UserCheck, CalendarClock, Inbox, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useEmployees, useAllLeaveRequests, useAllHrRequests } from '@/features/hr/hooks/use-hr'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function StatTile({ label, value, hint, icon: Icon, loading }: { label: string; value: React.ReactNode; hint?: string; icon: React.ComponentType<{ className?: string }>; loading?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 font-display text-2xl font-semibold">{value}</p>}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

/** "Who's out" — a month grid marking days with at least one approved
 * leave request covering them; click a marked day to see who. Reuses the
 * same leave-requests fetch the KPI tiles already use, just re-sliced by
 * date instead of by status. */
function LeaveCalendarCard({ organizationId }: { organizationId: string | null }) {
  const { data: leaveRequests, isLoading } = useAllLeaveRequests(organizationId)
  const [cursor, setCursor] = React.useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = React.useState<string | null>(null)

  const approved = React.useMemo(() => (leaveRequests ?? []).filter((r) => r.status === 'approved'), [leaveRequests])
  const namesOnDay = React.useCallback(
    (key: string) => approved.filter((r) => r.start_date <= key && r.end_date >= key).map((r) => r.requester_name ?? 'Someone'),
    [approved],
  )

  const gridStart = startOfWeek(startOfMonth(cursor))
  const gridEnd = endOfWeek(endOfMonth(cursor))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
  const selectedNames = selected ? namesOnDay(selected) : []

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border p-4">
        <p className="font-display text-base font-semibold">Who's out</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="w-28 text-center text-sm font-medium">{format(cursor, 'MMMM yyyy')}</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-4"><Skeleton className="h-56 w-full" /></div>
      ) : (
        <>
          <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-[10px] font-semibold uppercase text-muted-foreground">
            {WEEKDAYS.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const names = namesOnDay(key)
              const inMonth = isSameMonth(day, cursor)
              return (
                <button
                  key={key}
                  disabled={names.length === 0}
                  onClick={() => setSelected((s) => (s === key ? null : key))}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-1 border-b border-r border-border text-xs transition-colors last:border-r-0',
                    !inMonth && 'text-muted-foreground/50',
                    names.length > 0 && 'cursor-pointer hover:bg-muted/40',
                    selected === key && 'bg-primary/10',
                  )}
                >
                  <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full', isToday(day) && 'bg-primary font-semibold text-primary-foreground')}>
                    {format(day, 'd')}
                  </span>
                  {names.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />}
                </button>
              )
            })}
          </div>
          {selected && selectedNames.length > 0 && (
            <div className="border-t border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">{format(new Date(`${selected}T00:00:00`), 'EEEE, MMM d')} — on leave</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selectedNames.map((n, i) => <Badge key={i} variant="outline">{n}</Badge>)}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

/** HR's own landing page — a quick read on headcount, leave and requests
 * awaiting action. Departments/Job titles/Leave types config now lives on
 * HR Reports instead of here, so this stays pure KPIs + calendar.
 * Recruitment/Attendance/Performance stats join this once those modules
 * exist (Phase 2). */
export function HrOverviewPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: employees, isLoading: loadingEmployees } = useEmployees(activeOrgId)
  const canManageRequests = has('hr_requests.manage')
  // Not gated on leave.manage — RLS already limits a non-manager to their
  // own rows, and "On Leave" needs to be right for anyone who can even see
  // this dashboard (hr.view_reports), not just leave approvers.
  const { data: leaveRequests } = useAllLeaveRequests(activeOrgId)
  const { data: hrRequests } = useAllHrRequests(canManageRequests ? activeOrgId : null)

  const active = (employees ?? []).filter((e) => e.profile?.employment_status === 'active' || !e.profile).length
  // Derived from actually-approved leave covering today, not the
  // employment_status field — that field is a manual profile setting
  // nothing keeps in sync with real leave requests, so it stayed 0 even
  // after a request was approved. Someone can be "Active" and "On Leave"
  // at once here; this tile answers "who's out today", not job status.
  const today = new Date().toISOString().slice(0, 10)
  const onLeave = new Set(
    (leaveRequests ?? [])
      .filter((r) => r.status === 'approved' && r.start_date <= today && r.end_date >= today)
      .map((r) => r.user_id),
  ).size
  const pendingLeave = (leaveRequests ?? []).filter((r) => r.status === 'pending').length
  const pendingRequests = (hrRequests ?? []).filter((r) => r.status === 'submitted' || r.status === 'in_review').length
  const canManageLeave = has('leave.manage')

  return (
    <div>
      <PageHeader title="HR Overview" description="Headcount, leave and requests at a glance." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total Employees" value={employees?.length ?? 0} hint="Active + suspended" icon={Users} loading={loadingEmployees} />
        <StatTile label="Active" value={active} icon={UserCheck} loading={loadingEmployees} />
        <StatTile label="On Leave" value={onLeave} hint="Today" icon={CalendarClock} loading={loadingEmployees} />
        <StatTile
          label="Pending Approvals"
          value={canManageLeave || canManageRequests ? pendingLeave + pendingRequests : '—'}
          hint={canManageLeave || canManageRequests ? `${pendingLeave} leave · ${pendingRequests} requests` : 'No approval access'}
          icon={Inbox}
        />
      </div>

      <div className="mt-6">
        <LeaveCalendarCard organizationId={activeOrgId} />
      </div>
    </div>
  )
}
