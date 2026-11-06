import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Banknote,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Clock,
  FolderOpen,
  Receipt,
  Sparkles,
  Users,
  AlertTriangle,
  Wallet,
  History,
  Scale,
} from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { useDateRange } from '@/features/dashboard/hooks/use-date-range'
import { useDashboardKpis } from '@/features/dashboard/hooks/use-dashboard-kpis'
import { useMyDashboardKpis } from '@/features/dashboard/hooks/use-my-dashboard-kpis'
import { useFirmInsights } from '@/features/dashboard/hooks/use-firm-insights'
import { useRecentMatters } from '@/features/dashboard/hooks/use-recent-matters'
import { useBranchScope } from '@/features/dashboard/hooks/use-branch-scope'
import { BranchSelector } from '@/features/dashboard/components/branch-selector'
import { useBillingStats, usePersonalStats } from '@/features/billing/hooks/use-billing'
import { useFundRequests } from '@/features/funds/hooks/use-funds'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { OPEN_ADVANCE_STATUSES, outstandingBalance } from '@/features/funds/types'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { DateRangeControl } from '@/features/dashboard/components/date-range-control'
import { PerformanceCard } from '@/features/dashboard/components/performance-card'
import { SpendingCard } from '@/features/dashboard/components/spending-card'
import { PendingActionsCard } from '@/features/dashboard/components/pending-actions-card'
import { CircularsNotice } from '@/features/dashboard/components/circulars-notice'
import { SurveysNotice } from '@/features/dashboard/components/surveys-notice'
import { UpcomingHearingsCard } from '@/features/dashboard/components/upcoming-hearings-card'
import { BillableHoursCard } from '@/features/dashboard/components/billable-hours-card'
import { RecentActivityFeed } from '@/features/dashboard/components/recent-activity-feed'
import { YourTasksCard } from '@/features/dashboard/components/your-tasks-card'
import { OnboardingChecklistCard } from '@/features/onboarding/components/onboarding-checklist-card'
import { MATTER_STATUS_META } from '@/features/matters/types'
import { formatMoneyCompact, initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { PageHeader } from '@/shared/components/page-header'
import { EmptyState } from '@/shared/components/empty-state'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

/** Rule-based risk & opportunity scan over the firm's live data. */
function InsightsCard({ organizationId, financial, className }: { organizationId: string | null; financial: boolean; className?: string }) {
  const { data: insights, isLoading } = useFirmInsights(organizationId, financial)
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: 'radial-gradient(24rem 24rem at 100% 0%, hsl(var(--primary) / 0.10), transparent 60%)' }}
      />
      <CardHeader className="relative flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Insights</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">From your firm's live data</p>
        </div>
        <Sparkles className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent className="relative">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <ul className="space-y-3">
            {(insights ?? []).map((insight) => (
              <li key={insight.id}>
                <Link to={insight.to} className="group flex items-start gap-2.5">
                  <span
                    className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', {
                      'bg-destructive': insight.severity === 'alert',
                      'bg-warning': insight.severity === 'warning',
                      'bg-primary': insight.severity === 'suggestion',
                      'bg-success': insight.severity === 'positive',
                    })}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium group-hover:underline">{insight.title}</span>
                    {insight.detail && <span className="block truncate text-xs text-muted-foreground">{insight.detail}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Secondary numbers in one compact strip, so the headline tiles stay few. */
function GlanceStrip({ items, loading }: { items: { label: string; value: string; to?: string; tone?: 'warn' }[]; loading: boolean }) {
  return (
    <Card className="mt-4">
      <dl className={cn('grid grid-cols-2 divide-border sm:grid-cols-3', items.length > 6 ? 'lg:grid-cols-7' : 'lg:grid-cols-6', 'lg:divide-x')}>
        {items.map((i) => {
          const inner = (
            <>
              <dt className="text-xs text-muted-foreground">{i.label}</dt>
              <dd className={cn('mt-0.5 font-display text-lg font-semibold tabular-nums', i.tone === 'warn' && 'text-warning')}>
                {loading ? <Skeleton className="h-6 w-14" /> : i.value}
              </dd>
            </>
          )
          return i.to
            ? <Link key={i.label} to={i.to} className="px-4 py-3 transition-colors hover:bg-muted/40">{inner}</Link>
            : <div key={i.label} className="px-4 py-3">{inner}</div>
        })}
      </dl>
    </Card>
  )
}

export function DashboardPage() {
  const { profile, activeMembership, activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { has: hasFeature } = usePlanFeature(activeOrgId)
  const canFinancials = has('reports.financial')
  const hrFunds = hasFeature('hr_module') && hasFeature('fund_requests') && (has('funds.approve') || has('funds.manage'))
  const dateRange = useDateRange()
  const branchScope = useBranchScope()

  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis(activeOrgId, branchScope.selectedBranchId)
  const { data: myKpis, isLoading: myKpisLoading } = useMyDashboardKpis(canFinancials ? null : activeOrgId, userId)
  // Firm revenue is restricted to leadership/finance; others see their own numbers.
  const { data: billing, isLoading: billingLoading } = useBillingStats(canFinancials ? activeOrgId : null)
  const { data: personal, isLoading: personalLoading } = usePersonalStats(canFinancials ? null : activeOrgId, userId)
  const { data: recentMatters, isLoading: recentMattersLoading } = useRecentMatters(activeOrgId, 5, branchScope.selectedBranchId)
  const { data: funds, isLoading: fundsLoading } = useFundRequests(hrFunds ? activeOrgId : null)
  const { data: employees, isLoading: employeesLoading } = useEmployeeRegister(hasFeature('hr_module') && has('staff.view') ? activeOrgId : null)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const orgName = activeMembership?.organization.name
  const s = billing
  const p = personal
  const my = myKpis

  const pendingFunds = (funds ?? []).filter((r) => r.status === 'pending')
  const openAdvances = (funds ?? []).filter((r) => OPEN_ADVANCE_STATUSES.includes(r.status) && outstandingBalance(r) > 0)
  const staffCount = (employees ?? []).filter((e) => !['resigned', 'terminated', 'former_employee'].includes(e.employment_status)).length

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={orgName ? `Here's what's happening at ${orgName} today.` : undefined}
        actions={
          branchScope.canSelect ? (
            <BranchSelector options={branchScope.options} value={branchScope.selectedBranchId} onChange={branchScope.setSelectedBranchId} />
          ) : undefined
        }
      />

      <OnboardingChecklistCard organizationId={activeOrgId} />

      {/* Headline numbers — six, each a door to where it lives. */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {canFinancials ? (
          <>
            <StatTile label="Active matters" countTo={kpis?.activeMatters ?? 0} value={String(kpis?.activeMatters ?? 0)} hint={`${kpis?.openMatters ?? 0} open · ${kpis?.mattersInCourt ?? 0} in court`} icon={Briefcase} loading={kpisLoading} to="/matters" />
            <StatTile label="Active clients" countTo={kpis?.activeClients ?? 0} value={String(kpis?.activeClients ?? 0)} hint="Currently active" icon={Users} loading={kpisLoading} to="/clients" />
            <StatTile label="Hearings this week" countTo={kpis?.hearingsThisWeek ?? 0} value={String(kpis?.hearingsThisWeek ?? 0)} hint="Next 7 days" icon={CalendarClock} loading={kpisLoading} to="/hearings" emphasis={(kpis?.hearingsThisWeek ?? 0) > 0} />
            <StatTile label="Revenue this month" value={formatMoneyCompact(s?.revenueMTD ?? 0)} hint={`${formatMoneyCompact(s?.outstanding ?? 0)} outstanding`} icon={Banknote} loading={billingLoading} to="/billing" />
            {hrFunds ? (
              <>
                <StatTile label="Pending fund requests" countTo={pendingFunds.length} value={String(pendingFunds.length)} hint={formatMoneyCompact(pendingFunds.reduce((t, r) => t + Number(r.amount), 0))} icon={Wallet} loading={fundsLoading} to="/hr/funds" />
                <StatTile label="Outstanding retirements" countTo={openAdvances.length} value={String(openAdvances.length)} hint={`${formatMoneyCompact(openAdvances.reduce((t, r) => t + outstandingBalance(r), 0))} unaccounted`} icon={Scale} loading={fundsLoading} to="/hr/retirements" emphasis={openAdvances.length > 0} />
              </>
            ) : (
              <>
                <StatTile label="Unbilled work" value={formatMoneyCompact(s?.unbilledValue ?? 0)} hint="Not yet invoiced" icon={Wallet} loading={billingLoading} to="/billing" />
                <StatTile label="Overdue invoices" countTo={s?.overdueCount ?? 0} value={String(s?.overdueCount ?? 0)} hint="Past due date" icon={AlertTriangle} loading={billingLoading} to="/billing" emphasis={(s?.overdueCount ?? 0) > 0} />
              </>
            )}
          </>
        ) : (
          <>
            <StatTile label="Active matters" countTo={my?.myActiveMatters ?? 0} value={String(my?.myActiveMatters ?? 0)} hint="You lead these" icon={Briefcase} loading={myKpisLoading} to="/matters" />
            <StatTile label="Hearings this week" countTo={my?.myHearingsThisWeek ?? 0} value={String(my?.myHearingsThisWeek ?? 0)} hint="Next 7 days" icon={CalendarClock} loading={myKpisLoading} to="/hearings" emphasis={(my?.myHearingsThisWeek ?? 0) > 0} />
            <StatTile label="Open tasks" countTo={p?.openTasks ?? 0} value={String(p?.openTasks ?? 0)} hint="Assigned to you, not yet done" icon={CheckSquare} loading={personalLoading} to="/tasks" />
            <StatTile label="Clients" countTo={my?.myClients ?? 0} value={String(my?.myClients ?? 0)} hint="Across matters you lead" icon={Users} loading={myKpisLoading} to="/clients" />
            <StatTile label="Billable hours" value={`${p?.billableHoursMTD ?? 0}h`} hint="This month" icon={Clock} loading={personalLoading} to="/billing" />
            <StatTile label="Logged expenses" value={formatMoneyCompact(p?.expensesMTD ?? 0)} hint="This month" icon={Receipt} loading={personalLoading} to="/billing" />
          </>
        )}
      </div>

      {canFinancials && (
        <GlanceStrip
          loading={kpisLoading || billingLoading || employeesLoading}
          items={[
            { label: 'Open matters', value: String(kpis?.openMatters ?? 0), to: '/matters' },
            { label: 'Matters in court', value: String(kpis?.mattersInCourt ?? 0), to: '/matters' },
            { label: 'Billable hours (firm)', value: `${s?.billableHoursMTD ?? 0}h`, to: '/billing' },
            { label: 'Outstanding invoices', value: formatMoneyCompact(s?.outstanding ?? 0), to: '/billing' },
            { label: 'Unbilled work', value: formatMoneyCompact(s?.unbilledValue ?? 0), to: '/billing' },
            { label: 'Overdue invoices', value: String(s?.overdueCount ?? 0), to: '/billing', tone: (s?.overdueCount ?? 0) > 0 ? 'warn' : undefined },
            ...(hasFeature('hr_module') && has('staff.view') ? [{ label: 'Employees', value: String(staffCount), to: '/hr/employees' }] : []),
          ]}
        />
      )}

      {/* Performance + where the money went */}
      <div className="mt-6 space-y-4">
        <DateRangeControl
          range={dateRange.range}
          onPresetChange={dateRange.setPreset}
          onCustomFromChange={dateRange.setCustomFrom}
          onCustomToChange={dateRange.setCustomTo}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {canFinancials ? <PerformanceCard range={dateRange.range} className="lg:col-span-2" /> : <BillableHoursCard range={dateRange.range} />}
          {hrFunds ? <SpendingCard /> : <InsightsCard organizationId={activeOrgId} financial={canFinancials} />}
        </div>
      </div>

      {hasFeature('hr_module') && hasFeature('circulars') && <CircularsNotice />}
      {hasFeature('hr_module') && hasFeature('surveys') && <SurveysNotice />}

      {/* What needs doing, what's coming, what the data says */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <PendingActionsCard overdueInvoices={canFinancials ? s?.overdueCount : undefined} />
        <UpcomingHearingsCard branchId={branchScope.selectedBranchId} />
        {hrFunds ? <InsightsCard organizationId={activeOrgId} financial={canFinancials} /> : <RecentActivityFeed className="" limit={6} />}
      </div>

      <div className="mt-6">
        <YourTasksCard />
      </div>

      {/* Recently updated matters + firm activity, side by side */}
      <div className={cn('mt-6 grid gap-6', hrFunds && 'lg:grid-cols-2')}>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Recently updated matters</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">Latest activity across your firm's matters</p>
            </div>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {recentMattersLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : recentMatters && recentMatters.length > 0 ? (
              <ul className="divide-y divide-border/70">
                {recentMatters.map((m) => {
                  const status = MATTER_STATUS_META[m.status]
                  return (
                    <li key={m.id}>
                      <Link to={`/matters/${m.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">
                          {initialsOf(m.lead_lawyer?.full_name, 'M')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{m.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.matter_number} {m.client ? `· ${m.client.display_name}` : ''}
                            {m.lead_lawyer?.full_name ? ` · ${m.lead_lawyer.full_name}` : ''}
                          </p>
                          {m.latestActivity && <p className="mt-0.5 truncate text-xs text-muted-foreground">Latest: {m.latestActivity}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={status.variant}>{status.label}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(m.updated_at), { addSuffix: true })}</span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="No matters yet"
                description="Once you open your first matter, it'll show up here with its latest activity."
                action={has('matters.create') ? { label: 'Create your first matter', to: '/matters' } : undefined}
              />
            )}
          </CardContent>
        </Card>
        {hrFunds && <RecentActivityFeed className="" limit={8} />}
      </div>
    </div>
  )
}
