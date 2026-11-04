import * as React from 'react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, eachDayOfInterval, format, formatDistanceToNow, subDays } from 'date-fns'
import {
  Globe,
  Users2,
  Activity,
  Banknote,
  LifeBuoy,
  AlertTriangle,
  Hourglass,
  CreditCard,
  PauseCircle,
  ClipboardList,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { formatMoneyCompact, formatNaira, initialsOf, titleCase } from '@/shared/lib/format'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  usePlatformStats,
  usePlatformOrganizations,
  usePlatformActivity,
  usePlatformTrends,
  useRevenueAnalytics,
  useSubscriptions,
} from '@/features/platform/hooks/use-platform'
import { useTickets } from '@/features/support/hooks/use-support'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { PlatformHealth } from '@/features/platform/components/platform-health'
import { CreateOrganizationDialog } from '@/features/platform/components/create-organization-dialog'
import type { PlatformTrends } from '@/features/platform/types'
import { PageHeader } from '@/shared/components/page-header'
import { TimeSeriesChart, type TimeSeriesPoint } from '@/shared/components/timeseries-chart'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

const OPEN_TICKET = ['open', 'in_progress', 'waiting']

function CardHead({ title, sub, icon: Icon, action }: { title: string; sub?: string; icon?: LucideIcon; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display text-base font-semibold">
          {Icon && <Icon className="h-4 w-4 text-primary" />} {title}
        </p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

function Toggle<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function GlanceStrip({ items, loading }: { items: { label: string; value: string; to?: string; tone?: 'warn' }[]; loading: boolean }) {
  return (
    <Card className="mt-4">
      <dl className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-7 lg:divide-x">
        {items.map((i) => {
          const inner = (
            <>
              <dt className="text-xs text-muted-foreground">{i.label}</dt>
              <dd className={cn('mt-0.5 font-display text-lg font-semibold tabular-nums', i.tone === 'warn' && 'text-warning')}>
                {loading ? <Skeleton className="h-6 w-14" /> : i.value}
              </dd>
            </>
          )
          return i.to ? (
            <Link key={i.label} to={i.to} className="px-4 py-3 transition-colors hover:bg-muted/40">{inner}</Link>
          ) : (
            <div key={i.label} className="px-4 py-3">{inner}</div>
          )
        })}
      </dl>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Daily growth — one line at a time, switched by metric
// ---------------------------------------------------------------------------
type Metric = 'firms' | 'members' | 'events'
type DayPoint = TimeSeriesPoint & { names: string[] }

const METRICS: { value: Metric; label: string; noun: [string, string]; blurb: string }[] = [
  { value: 'firms', label: 'New firms', noun: ['firm', 'firms'], blurb: 'Organizations signing up per day' },
  { value: 'members', label: 'New users', noun: ['user', 'users'], blurb: 'People added to a firm per day' },
  { value: 'events', label: 'Activity', noun: ['action', 'actions'], blurb: 'Audited actions across every firm per day' },
]

function GrowthTrendCard({ trends, loading }: { trends: PlatformTrends | undefined; loading: boolean }) {
  const [metric, setMetric] = React.useState<Metric>('firms')
  const [range, setRange] = React.useState<30 | 90>(30)
  const meta = METRICS.find((m) => m.value === metric)!

  const data = React.useMemo<DayPoint[]>(() => {
    const days = eachDayOfInterval({ start: subDays(new Date(), range - 1), end: new Date() })
    const byDay = new Map(days.map((d) => [format(d, 'yyyy-MM-dd'), { value: 0, names: [] as string[] }]))
    const bump = (iso: string, name?: string) => {
      const b = byDay.get(format(new Date(iso), 'yyyy-MM-dd'))
      if (!b) return
      b.value += 1
      if (name) b.names.push(name)
    }
    if (metric === 'firms') trends?.organizations.forEach((o) => bump(o.at, o.name))
    else (metric === 'members' ? trends?.members : trends?.events)?.forEach((t) => bump(t))
    return days.map((d) => {
      const key = format(d, 'yyyy-MM-dd')
      const b = byDay.get(key)!
      return { date: key, label: format(d, 'MMM d'), value: b.value, names: b.names }
    })
  }, [trends, metric, range])

  const total = data.reduce((s, d) => s + d.value, 0)
  const half = Math.floor(data.length / 2)
  const recent = data.slice(half).reduce((s, d) => s + d.value, 0)
  const earlier = data.slice(0, half).reduce((s, d) => s + d.value, 0)
  const change = earlier > 0 ? Math.round(((recent - earlier) / earlier) * 100) : null

  return (
    <Card className="p-5">
      <CardHead
        title="Platform growth"
        sub={`${meta.blurb} · last ${range} days`}
        icon={Activity}
        action={<Toggle value={range} onChange={setRange} options={[{ value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />}
      />
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold tabular-nums">{loading ? '—' : total.toLocaleString()}</span>
          <span className="text-sm text-muted-foreground">{total === 1 ? meta.noun[0] : meta.noun[1]}</span>
          {change != null && !loading && (
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', change >= 0 ? 'bg-success/12 text-success' : 'bg-destructive/12 text-destructive')}>
              {change >= 0 ? '+' : ''}{change}% vs previous {Math.ceil(range / 2)} days
            </span>
          )}
        </div>
        <Toggle value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.value, label: m.label }))} />
      </div>
      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : (
        <TimeSeriesChart
          data={data}
          renderTooltip={(p) => (
            <div className="max-w-[220px] space-y-0.5 text-xs">
              <p className="font-medium">{p.label} · {p.value} {p.value === 1 ? meta.noun[0] : meta.noun[1]}</p>
              {p.names.length > 0 && <p className="truncate text-muted-foreground">{p.names.slice(0, 3).join(', ')}{p.names.length > 3 ? ` +${p.names.length - 3}` : ''}</p>}
            </div>
          )}
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recurring revenue trend
// ---------------------------------------------------------------------------
type MrrPoint = TimeSeriesPoint & { newMrr: number; churnedMrr: number }

function MrrTrendCard() {
  const { data, isLoading } = useRevenueAnalytics()
  const points = React.useMemo<MrrPoint[]>(
    () => (data?.trend ?? []).map((t, i) => ({ date: String(i), label: t.label, value: t.value, newMrr: data!.movement[i]?.newMrr ?? 0, churnedMrr: data!.movement[i]?.churnedMrr ?? 0 })),
    [data],
  )
  const first = points[0]?.value ?? 0
  const last = points[points.length - 1]?.value ?? 0
  const growth = first > 0 ? Math.round(((last - first) / first) * 100) : null

  return (
    <Card className="p-5">
      <CardHead
        title="Monthly recurring revenue"
        sub="MRR at the end of each month · last 6 months"
        icon={Banknote}
        action={<Button asChild variant="link" size="sm" className="h-auto p-0"><Link to="/platform/revenue">Revenue analytics</Link></Button>}
      />
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums">{isLoading ? '—' : formatNaira(data?.mrr ?? 0)}</span>
        <span className="text-sm text-muted-foreground">this month</span>
        {growth != null && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', growth >= 0 ? 'bg-success/12 text-success' : 'bg-destructive/12 text-destructive')}>
            {growth >= 0 ? '+' : ''}{growth}% in 6 months
          </span>
        )}
      </div>
      {isLoading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : (
        <TimeSeriesChart
          data={points}
          height={200}
          formatValue={formatMoneyCompact}
          renderTooltip={(p) => (
            <div className="space-y-0.5 text-xs">
              <p className="font-medium">{p.label} · {formatNaira(p.value)}</p>
              <p className="text-muted-foreground">New {formatMoneyCompact(p.newMrr)} · Churned {formatMoneyCompact(p.churnedMrr)}</p>
            </div>
          )}
        />
      )}
      {data && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
          <div><p className="text-xs text-muted-foreground">Paying firms</p><p className="font-semibold tabular-nums">{data.payingCustomers}</p></div>
          <div><p className="text-xs text-muted-foreground">Avg. per firm</p><p className="font-semibold tabular-nums">{formatMoneyCompact(data.arpa)}</p></div>
          <div><p className="text-xs text-muted-foreground">Projected ARR</p><p className="font-semibold tabular-nums">{formatMoneyCompact(data.projectedArr)}</p></div>
        </div>
      )}
    </Card>
  )
}

function PlanMixCard() {
  const { data, isLoading } = useRevenueAnalytics()
  const rows = data?.byPlan ?? []
  const max = Math.max(1, ...rows.map((r) => r.customers))
  return (
    <Card className="p-5">
      <CardHead title="Plan mix" sub="Paying firms on each plan" icon={Layers} />
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No paying firms yet.</p>
      ) : (
        <ul className="space-y-3.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{r.customers}</span> · {formatMoneyCompact(r.value)}/mo
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.customers / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// What needs a platform admin today
// ---------------------------------------------------------------------------
function AttentionCard({ suspended }: { suspended: number }) {
  const subs = useSubscriptions()
  const tickets = useTickets({ status: 'all' })

  const items = React.useMemo(() => {
    const all = subs.data ?? []
    const now = new Date()
    const manual = all.filter((s) => s.payment_method === 'manual' && s.payment_status === 'pending')
    const pastDue = all.filter((s) => s.status === 'past_due')
    const ending = all.filter((s) => s.status === 'trialing' && s.trial_ends_at && differenceInCalendarDays(new Date(s.trial_ends_at), now) <= 7 && differenceInCalendarDays(new Date(s.trial_ends_at), now) >= 0)
    const open = (tickets.data ?? []).filter((t) => OPEN_TICKET.includes(t.status))
    const urgent = open.filter((t) => t.priority === 'urgent' || t.priority === 'high').length
    return [
      { key: 'manual', icon: CreditCard, label: 'Manual payments to verify', detail: manual.map((s) => s.organization?.name).filter(Boolean).slice(0, 2).join(', ') || 'Bank transfers awaiting review', count: manual.length, to: '/platform/subscriptions', tone: 'warn' as const },
      { key: 'tickets', icon: LifeBuoy, label: 'Open support tickets', detail: urgent ? `${urgent} high priority` : 'Waiting on the support team', count: open.length, to: '/platform/tickets', tone: urgent ? ('warn' as const) : undefined },
      { key: 'trials', icon: Hourglass, label: 'Trials ending this week', detail: ending.map((s) => s.organization?.name).filter(Boolean).slice(0, 2).join(', ') || 'Good time to follow up', count: ending.length, to: '/platform/subscriptions', tone: undefined },
      { key: 'pastdue', icon: AlertTriangle, label: 'Past-due subscriptions', detail: 'Payment failed or overdue', count: pastDue.length, to: '/platform/billing', tone: 'warn' as const },
      { key: 'suspended', icon: PauseCircle, label: 'Suspended firms', detail: 'Paused — no access until restored', count: suspended, to: '/platform/organizations', tone: undefined },
    ]
  }, [subs.data, tickets.data, suspended])

  const loading = subs.isLoading || tickets.isLoading
  const waiting = items.reduce((s, i) => s + i.count, 0)

  return (
    <Card className="p-5">
      <CardHead title="Needs attention" sub={loading ? 'Checking…' : waiting ? `${waiting} item${waiting === 1 ? '' : 's'} across the platform` : 'Nothing waiting — all clear'} icon={ClipboardList} />
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.key}>
              <Link to={i.to} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', i.count && i.tone === 'warn' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary')}>
                  <i.icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.count ? i.detail : 'None'}</span>
                </span>
                <span className={cn('min-w-[2rem] rounded-full px-2 py-0.5 text-center text-sm font-semibold tabular-nums', i.count ? (i.tone === 'warn' ? 'bg-warning/15 text-warning' : 'bg-primary/10 text-primary') : 'text-muted-foreground')}>
                  {i.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const ORG_STATUS: Record<string, 'success' | 'warning' | 'destructive' | 'muted'> = { active: 'success', trial: 'warning', suspended: 'destructive' }

export function PlatformDashboardPage() {
  const { profile } = useAuth()
  const stats = usePlatformStats()
  const orgs = usePlatformOrganizations()
  const activity = usePlatformActivity()
  const trends = usePlatformTrends()
  const revenue = useRevenueAnalytics()
  const tickets = useTickets({ status: 'all' })

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const s = stats.data
  const openTickets = (tickets.data ?? []).filter((t) => OPEN_TICKET.includes(t.status)).length
  const recentOrgs = [...(orgs.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6)

  return (
    <div>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${firstName}`}
        description={`Platform Console · ${format(new Date(), 'EEEE d MMMM yyyy')}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/platform/audit">Audit Logs</Link>
            </Button>
            <CreateOrganizationDialog />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Organizations" value="" countTo={s?.totalOrganizations ?? 0} hint={`${s?.paidOrganizations ?? 0} paid · ${s?.trialOrganizations ?? 0} on trial`} icon={Globe} loading={stats.isLoading} to="/platform/organizations" />
        <StatTile label="Monthly recurring revenue" value={formatMoneyCompact(s?.mrr ?? 0)} hint={`${formatMoneyCompact(s?.arr ?? 0)} a year`} icon={Banknote} loading={stats.isLoading} to="/platform/revenue" />
        <StatTile label="Users" value="" countTo={s?.totalUsers ?? 0} hint={`${s?.signedInToday ?? 0} active today`} icon={Users2} loading={stats.isLoading} to="/platform/organization-users" />
        <StatTile label="Open support tickets" value={String(openTickets)} hint="Open, in progress or waiting" icon={LifeBuoy} loading={tickets.isLoading} to="/platform/tickets" emphasis={openTickets > 0} />
      </div>

      <GlanceStrip
        loading={stats.isLoading}
        items={[
          { label: 'Paid firms', value: String(s?.paidOrganizations ?? 0), to: '/platform/subscriptions' },
          { label: 'On trial', value: String(s?.trialOrganizations ?? 0), to: '/platform/subscriptions' },
          { label: 'Suspended', value: String(s?.suspendedOrganizations ?? 0), to: '/platform/organizations', tone: s?.suspendedOrganizations ? 'warn' : undefined },
          { label: 'New this month', value: String(s?.organizationsThisMonth ?? 0) },
          { label: 'ARR', value: formatMoneyCompact(s?.arr ?? 0), to: '/platform/revenue' },
          { label: 'MRR at risk', value: formatMoneyCompact(revenue.data?.atRisk ?? 0), to: '/platform/billing', tone: revenue.data?.atRisk ? 'warn' : undefined },
          { label: 'Platform team', value: String(s?.platformUsers ?? 0), to: '/platform/users' },
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><GrowthTrendCard trends={trends.data} loading={trends.isLoading} /></div>
        <AttentionCard suspended={s?.suspendedOrganizations ?? 0} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><MrrTrendCard /></div>
        <PlanMixCard />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <CardHead
            title="Newest organizations"
            sub="Most recent sign-ups first"
            icon={Globe}
            action={<Button asChild variant="link" size="sm" className="h-auto p-0"><Link to="/platform/organizations">Manage all</Link></Button>}
          />
          {orgs.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : recentOrgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No organizations yet — create your first firm to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Firm</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 text-right font-medium">Members</th>
                    <th className="pb-2 pl-4 font-medium">Joined</th>
                    <th className="pb-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrgs.map((org) => (
                    <tr key={org.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-3">
                          {org.logo_url ? (
                            <img src={org.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-contain" />
                          ) : (
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">{initialsOf(org.name, 'OR')}</span>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{org.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{org.owner?.email ?? `/${org.slug}`}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{org.subscription?.plan?.name ?? '—'}</td>
                      <td className="py-2.5 text-right tabular-nums">{org.member_count}</td>
                      <td className="whitespace-nowrap py-2.5 pl-4 text-muted-foreground">{formatDistanceToNow(new Date(org.created_at), { addSuffix: true })}</td>
                      <td className="py-2.5 text-right"><Badge variant={ORG_STATUS[org.status] ?? 'muted'}>{titleCase(org.status)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <PlatformHealth reachable={!stats.isError} />
          <Card className="p-5">
            <CardHead title="Latest activity" icon={Activity} action={<Button asChild variant="link" size="sm" className="h-auto p-0"><Link to="/platform/audit">View all</Link></Button>} />
            {activity.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : activity.data && activity.data.length > 0 ? (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {activity.data.slice(0, 6).map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="text-sm font-medium leading-tight">{a.summary ?? titleCase(a.action.replace('.', ' '))}</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
