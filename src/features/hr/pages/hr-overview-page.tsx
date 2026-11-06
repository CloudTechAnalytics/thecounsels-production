import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isToday, addMonths, format, subDays,
} from 'date-fns'
import { Users, UserCheck, CalendarClock, Inbox, Wallet, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useEmployees, useAllLeaveRequests, useAllHrRequests, useLeaveTypes } from '@/features/hr/hooks/use-hr'
import { useFundRequests, useFundApprovalRights } from '@/features/funds/hooks/use-funds'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { OPEN_ADVANCE_STATUSES, outstandingBalance } from '@/features/funds/types'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { HR_REQUEST_TYPES } from '@/features/hr/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { TimeSeriesChart, type TimeSeriesPoint } from '@/shared/components/timeseries-chart'
import { formatNaira, initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { useApprovalRights } from '@/features/hr/hooks/use-approval-rules'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function StatTile({ label, value, hint, icon: Icon, loading }: { label: string; value: React.ReactNode; hint?: string; icon: React.ComponentType<{ className?: string }>; loading?: boolean }) {
  return (
    <Card className="flex items-start gap-3 p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1.5 h-7 w-16" /> : <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">{value}</p>}
        {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
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
          <p className="w-24 text-center text-sm font-medium">{format(cursor, 'MMM yyyy')}</p>
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
                    'flex h-11 flex-col items-center justify-center gap-0.5 border-b border-r border-border text-xs transition-colors [&:nth-child(7n)]:border-r-0',
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

// ---------------------------------------------------------------------------
// One shape for leave, HR and fund requests, so the chart, donut, recent list
// and approvals table can treat them together.
// ---------------------------------------------------------------------------
type Kind = 'leave' | 'hr' | 'funds'
type Stage = 'pending' | 'in_review' | 'approved' | 'rejected'

interface Activity {
  id: string
  ref: string
  kind: Kind
  who: string
  detail: string
  amount: string
  stage: Stage | null
  createdAt: string
  href: string
  needsMe: boolean
}

const KIND_LABEL: Record<Kind, string> = { leave: 'Leave', hr: 'HR request', funds: 'Funds' }

const STAGES: { key: Stage; label: string; color: string; badge: 'warning' | 'default' | 'success' | 'destructive' }[] = [
  { key: 'pending', label: 'Pending', color: 'hsl(var(--warning))', badge: 'warning' },
  { key: 'in_review', label: 'In progress', color: 'hsl(var(--primary))', badge: 'default' },
  { key: 'approved', label: 'Approved', color: 'hsl(var(--success))', badge: 'success' },
  { key: 'rejected', label: 'Rejected', color: 'hsl(var(--destructive))', badge: 'destructive' },
]

function leaveStage(s: string): Stage | null {
  return s === 'pending' ? 'pending' : s === 'approved' ? 'approved' : s === 'rejected' ? 'rejected' : null
}
function hrStage(s: string): Stage | null {
  if (s === 'submitted') return 'pending'
  if (s === 'in_review' || s === 'in_progress') return 'in_review'
  if (s === 'approved' || s === 'completed') return 'approved'
  return s === 'rejected' ? 'rejected' : null
}
function fundStage(s: string): Stage | null {
  if (s === 'pending') return 'pending'
  if (s === 'returned') return 'pending'
  if (s === 'approved' || s === 'payment_processing' || s === 'disbursed' || s === 'retirement_submitted' || s === 'partially_retired') return 'in_review'
  if (s === 'retired' || s === 'closed') return 'approved'
  return s === 'rejected' ? 'rejected' : null
}

function useHrActivity() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data: leave, isLoading: l1 } = useAllLeaveRequests(activeOrgId)
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const { data: hr, isLoading: l2 } = useAllHrRequests(has('hr_requests.manage') ? activeOrgId : null)
  const { has: hasFeature } = usePlanFeature(activeOrgId)
  const { data: funds, isLoading: l3 } = useFundRequests(has('funds.request') && hasFeature('fund_requests') ? activeOrgId : null)
  const { canActOn, canFinance } = useFundApprovalRights()
  const { can } = useApprovalRights()
  const canLeave = has('leave.manage') && can('leave')
  const canHr = has('hr_requests.manage') && can('hr_request')

  const items = React.useMemo<Activity[]>(() => {
    const typeName = (id: string) => leaveTypes?.find((t) => t.id === id)?.name ?? 'Leave'
    const out: Activity[] = []
    for (const r of leave ?? []) {
      out.push({
        id: r.id, ref: 'Leave', kind: 'leave', who: r.requester_name ?? 'Someone',
        detail: `${typeName(r.leave_type_id)} · ${format(new Date(r.start_date), 'MMM d')}–${format(new Date(r.end_date), 'MMM d')}`,
        amount: `${r.days} day${Number(r.days) === 1 ? '' : 's'}`,
        stage: leaveStage(r.status), createdAt: r.created_at, href: '/hr/leave',
        needsMe: canLeave && r.status === 'pending' && r.user_id !== userId,
      })
    }
    for (const r of hr ?? []) {
      out.push({
        id: r.id, ref: 'HR', kind: 'hr', who: r.requester_name ?? 'Someone',
        detail: `${HR_REQUEST_TYPES.find((t) => t.value === r.request_type)?.label ?? 'Request'} · ${r.subject}`,
        amount: '—', stage: hrStage(r.status), createdAt: r.created_at, href: '/hr/requests',
        needsMe: canHr && (r.status === 'submitted' || r.status === 'in_review') && r.user_id !== userId,
      })
    }
    for (const r of funds ?? []) {
      if (r.status === 'draft') continue
      out.push({
        id: r.id, ref: r.request_number ?? 'Funds', kind: 'funds', who: r.requester_name ?? 'Someone',
        detail: r.title, amount: formatNaira(Number(r.approved_amount ?? r.amount)),
        stage: fundStage(r.status), createdAt: r.submitted_at ?? r.created_at, href: `/hr/funds/${r.id}`,
        needsMe: canActOn(r) || (canFinance(r) && ['approved', 'payment_processing', 'retirement_submitted'].includes(r.status)),
      })
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [leave, leaveTypes, hr, funds, canActOn, canFinance, canLeave, canHr, userId])

  return { items, funds: funds ?? [], loading: l1 || l2 || l3 }
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
type DayPoint = TimeSeriesPoint & { leave: number; hr: number; funds: number }

function ActivityChartCard({ items, loading }: { items: Activity[]; loading: boolean }) {
  const [range, setRange] = React.useState<30 | 90>(30)
  const data = React.useMemo<DayPoint[]>(() => {
    const start = subDays(new Date(), range - 1)
    const days = eachDayOfInterval({ start, end: new Date() })
    const byDay = new Map(days.map((d) => [format(d, 'yyyy-MM-dd'), { leave: 0, hr: 0, funds: 0 }]))
    for (const i of items) {
      const k = i.createdAt.slice(0, 10)
      const b = byDay.get(k)
      if (b) b[i.kind] += 1
    }
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd')
      const b = byDay.get(key)!
      return { date: key, label: format(d, 'MMM d'), value: b.leave + b.hr + b.funds, ...b }
    })
  }, [items, range])
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-semibold">Request activity</p>
          <p className="text-xs text-muted-foreground">Leave, HR and fund requests submitted per day · {total} in the last {range} days</p>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {([30, 90] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>
      {loading ? <Skeleton className="h-[220px] w-full" /> : (
        <TimeSeriesChart
          data={data}
          renderTooltip={(p) => (
            <div className="space-y-0.5 text-xs">
              <p className="font-medium">{p.label} · {p.value} request{p.value === 1 ? '' : 's'}</p>
              <p className="text-muted-foreground">Leave {p.leave} · HR {p.hr} · Funds {p.funds}</p>
            </div>
          )}
        />
      )}
    </Card>
  )
}

/** Parts-of-a-whole across four states — a donut with its own legend +
 * counts, so state is never read from color alone. */
function StatusDonutCard({ items, loading }: { items: Activity[]; loading: boolean }) {
  const [hover, setHover] = React.useState<Stage | null>(null)
  const counts = STAGES.map((s) => ({ ...s, value: items.filter((i) => i.stage === s.key).length }))
  const total = counts.reduce((s, c) => s + c.value, 0)
  const r = 54
  const c = 2 * Math.PI * r
  const gap = total > 0 && counts.filter((x) => x.value > 0).length > 1 ? 2 : 0
  let offset = 0
  const active = hover ? counts.find((x) => x.key === hover) : null

  return (
    <Card className="p-5">
      <p className="mb-4 font-display text-base font-semibold">Requests by status</p>
      {loading ? <Skeleton className="h-[180px] w-full" /> : total === 0 ? (
        <p className="py-14 text-center text-sm text-muted-foreground">No requests yet.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`${total} requests by status`}>
            <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
            {counts.filter((x) => x.value > 0).map((x) => {
              const len = (x.value / total) * c
              const seg = (
                <circle
                  key={x.key}
                  cx="70" cy="70" r={r} fill="none"
                  stroke={x.color}
                  strokeWidth={hover === x.key ? 19 : 16}
                  strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`}
                  strokeDashoffset={-offset}
                  className="cursor-pointer transition-[stroke-width]"
                  onMouseEnter={() => setHover(x.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${x.label}: ${x.value}`}</title>
                </circle>
              )
              offset += len
              return seg
            })}
            <g className="rotate-90" style={{ transformOrigin: '70px 70px' }}>
              <text x="70" y="68" textAnchor="middle" className="fill-foreground font-display text-[22px] font-semibold">{active ? active.value : total}</text>
              <text x="70" y="86" textAnchor="middle" className="fill-muted-foreground text-[10px]">{active ? active.label : 'Total'}</text>
            </g>
          </svg>
          <ul className="min-w-[150px] flex-1 space-y-2.5 text-sm">
            {counts.map((x) => (
              <li
                key={x.key}
                className={cn('flex items-center justify-between gap-3 rounded px-1', hover === x.key && 'bg-muted/50')}
                onMouseEnter={() => setHover(x.key)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} aria-hidden />
                  {x.label}
                </span>
                <span className="tabular-nums text-muted-foreground">{x.value} ({total ? Math.round((x.value / total) * 100) : 0}%)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function StageBadge({ stage }: { stage: Stage | null }) {
  const s = STAGES.find((x) => x.key === stage)
  return s ? <Badge variant={s.badge}>{s.label}</Badge> : <Badge variant="muted">Closed</Badge>
}

function Person({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">{initialsOf(name)}</span>
      <span className="truncate">{name}</span>
    </span>
  )
}

function RecentRequestsCard({ items, loading }: { items: Activity[]; loading: boolean }) {
  const recent = items.filter((i) => i.stage !== null).slice(0, 5)
  return (
    <Card className="overflow-hidden p-0">
      <p className="border-b border-border p-4 font-display text-base font-semibold">Recent requests</p>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : recent.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((i) => (
            <li key={`${i.kind}-${i.id}`}>
              <Link to={i.href} className="block p-4 transition-colors hover:bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-primary">{i.ref}</span>
                  <StageBadge stage={i.stage} />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                  <Person name={i.who} />
                  <span className="shrink-0 font-medium tabular-nums">{i.amount}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{i.detail} · {format(new Date(i.createdAt), 'MMM d')}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function PendingApprovalsCard({ items, loading }: { items: Activity[]; loading: boolean }) {
  const [kind, setKind] = React.useState<'all' | Kind>('all')
  const [page, setPage] = React.useState(0)
  const PAGE = 6
  const pending = items.filter((i) => i.needsMe && (kind === 'all' || i.kind === kind))
  const pages = Math.max(1, Math.ceil(pending.length / PAGE))
  const rows = pending.slice(page * PAGE, page * PAGE + PAGE)
  React.useEffect(() => setPage(0), [kind])

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <p className="font-display text-base font-semibold">Needs your action <span className="text-muted-foreground">({pending.length})</span></p>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['all', 'leave', 'hr', 'funds'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors', kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {k === 'all' ? 'All' : KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Request</th>
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Details</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Submitted</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={`${i.kind}-${i.id}`} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium">{i.ref}</td>
                  <td className="px-4 py-2.5"><Person name={i.who} /></td>
                  <td className="px-4 py-2.5"><Badge variant="outline">{KIND_LABEL[i.kind]}</Badge></td>
                  <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground">{i.detail}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{i.amount}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{format(new Date(i.createdAt), 'MMM d, h:mm a')}</td>
                  <td className="px-2 py-2.5">
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8" aria-label="Open request">
                      <Link to={i.href}><Eye className="h-4 w-4" /></Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>Showing {page * PAGE + 1}–{Math.min(pending.length, page * PAGE + PAGE)} of {pending.length}</span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/** HR's own landing page — headcount, leave and every request type at a
 * glance: KPI tiles, activity and status charts, recent requests, what's
 * waiting on you, and who's out. Departments/Job titles/Leave types config
 * lives on HR Reports. */
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
  const { items, funds, loading } = useHrActivity()

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
  const pendingFunds = items.filter((i) => i.kind === 'funds' && i.needsMe).length
  const canManageLeave = has('leave.manage')
  const canSeeApprovals = canManageLeave || canManageRequests || pendingFunds > 0
  const { has: hasPlanFeature } = usePlanFeature(activeOrgId)
  const canSeeFunds = hasPlanFeature('fund_requests') && (has('funds.approve') || has('funds.manage'))
  const unretired = funds.filter((f) => OPEN_ADVANCE_STATUSES.includes(f.status) && outstandingBalance(f) > 0)

  return (
    <div>
      <PageHeader title="HR Overview" description="Headcount, leave and requests at a glance." />
      <div className={cn('grid grid-cols-2 gap-4', canSeeFunds ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
        <StatTile label="Total Employees" value={employees?.length ?? 0} hint="Active + suspended" icon={Users} loading={loadingEmployees} />
        <StatTile label="Active" value={active} icon={UserCheck} loading={loadingEmployees} />
        <StatTile label="On Leave" value={onLeave} hint="Today" icon={CalendarClock} loading={loadingEmployees} />
        <StatTile
          label="Pending Approvals"
          value={canSeeApprovals ? pendingLeave + pendingRequests + pendingFunds : '—'}
          hint={canSeeApprovals ? `${pendingLeave} leave · ${pendingRequests} HR · ${pendingFunds} funds` : 'No approval access'}
          icon={Inbox}
        />
        {canSeeFunds && (
          <StatTile
            label="Unretired Funds"
            value={formatNaira(unretired.reduce((s, f) => s + outstandingBalance(f), 0))}
            hint={`${unretired.length} advance${unretired.length === 1 ? '' : 's'} not yet accounted for`}
            icon={Wallet}
            loading={loading}
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ActivityChartCard items={items} loading={loading} />
            <StatusDonutCard items={items} loading={loading} />
          </div>
          <PendingApprovalsCard items={items} loading={loading} />
        </div>
        <div className="space-y-6">
          <RecentRequestsCard items={items} loading={loading} />
          <LeaveCalendarCard organizationId={activeOrgId} />
        </div>
      </div>
    </div>
  )
}
