import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Banknote,
  Briefcase,
  CalendarClock,
  CheckSquare,
  Clock,
  FolderOpen,
  Gavel,
  Receipt,
  Sparkles,
  Users,
  AlertCircle,
  AlertTriangle,
  Wallet,
  History,
} from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useDateRange } from '@/features/dashboard/hooks/use-date-range'
import { useDashboardKpis } from '@/features/dashboard/hooks/use-dashboard-kpis'
import { useMyDashboardKpis } from '@/features/dashboard/hooks/use-my-dashboard-kpis'
import { useFirmInsights } from '@/features/dashboard/hooks/use-firm-insights'
import { useRecentMatters } from '@/features/dashboard/hooks/use-recent-matters'
import { useBranchScope } from '@/features/dashboard/hooks/use-branch-scope'
import { BranchSelector } from '@/features/dashboard/components/branch-selector'
import { useBillingStats, usePersonalStats } from '@/features/billing/hooks/use-billing'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { DateRangeControl } from '@/features/dashboard/components/date-range-control'
import { FirmActivityCard } from '@/features/dashboard/components/firm-activity-card'
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

export function DashboardPage() {
  const { profile, activeMembership, activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canFinancials = has('reports.financial')
  const dateRange = useDateRange()
  const branchScope = useBranchScope()

  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis(activeOrgId, branchScope.selectedBranchId)
  const { data: myKpis, isLoading: myKpisLoading } = useMyDashboardKpis(canFinancials ? null : activeOrgId, userId)
  // Firm revenue is restricted to leadership/finance; others see their own numbers.
  const { data: billing, isLoading: billingLoading } = useBillingStats(canFinancials ? activeOrgId : null)
  const { data: personal, isLoading: personalLoading } = usePersonalStats(canFinancials ? null : activeOrgId, userId)
  const { data: insights, isLoading: insightsLoading } = useFirmInsights(activeOrgId, canFinancials)
  const { data: recentMatters, isLoading: recentMattersLoading } = useRecentMatters(activeOrgId, 5, branchScope.selectedBranchId)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const orgName = activeMembership?.organization.name
  const s = billing
  const p = personal
  const my = myKpis

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

      {/* KPIs — role-aware. 10 tiles (financial) and 6 (personal) need
          different column counts to land evenly instead of leaving a
          lone tile stranded on its own row (6 in a 5-col grid = 5+1). */}
      <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-3', canFinancials ? 'lg:grid-cols-5' : 'lg:grid-cols-6')}>
        {canFinancials ? (
          <>
            <StatTile label="Active matters" countTo={kpis?.activeMatters ?? 0} value={String(kpis?.activeMatters ?? 0)} hint="Open, pending or in court" icon={Briefcase} loading={kpisLoading} />
            <StatTile label="Open matters" countTo={kpis?.openMatters ?? 0} value={String(kpis?.openMatters ?? 0)} hint="Not yet in court" icon={FolderOpen} loading={kpisLoading} />
            <StatTile label="Matters in court" countTo={kpis?.mattersInCourt ?? 0} value={String(kpis?.mattersInCourt ?? 0)} hint="Currently litigating" icon={Gavel} loading={kpisLoading} />
            <StatTile label="Hearings this week" countTo={kpis?.hearingsThisWeek ?? 0} value={String(kpis?.hearingsThisWeek ?? 0)} hint="Next 7 days" icon={CalendarClock} loading={kpisLoading} />
            <StatTile label="Active clients" countTo={kpis?.activeClients ?? 0} value={String(kpis?.activeClients ?? 0)} hint="Currently active" icon={Users} loading={kpisLoading} />
            <StatTile label="Billable hours (firm)" value={`${s?.billableHoursMTD ?? 0}h`} hint="This month" icon={Clock} loading={billingLoading} />
            <StatTile label="Revenue this month" value={formatMoneyCompact(s?.revenueMTD ?? 0)} hint="Invoiced this month" icon={Banknote} loading={billingLoading} />
            <StatTile label="Outstanding invoices" value={formatMoneyCompact(s?.outstanding ?? 0)} hint="Invoiced, not yet collected" icon={AlertCircle} loading={billingLoading} />
            <StatTile label="Unbilled work" value={formatMoneyCompact(s?.unbilledValue ?? 0)} hint="Not yet invoiced" icon={Wallet} loading={billingLoading} />
            <StatTile label="Overdue invoices" countTo={s?.overdueCount ?? 0} value={String(s?.overdueCount ?? 0)} hint="Past due date" icon={AlertTriangle} loading={billingLoading} />
          </>
        ) : (
          <>
            <StatTile label="Active matters" countTo={my?.myActiveMatters ?? 0} value={String(my?.myActiveMatters ?? 0)} hint="You lead these" icon={Briefcase} loading={myKpisLoading} />
            <StatTile label="Hearings this week" countTo={my?.myHearingsThisWeek ?? 0} value={String(my?.myHearingsThisWeek ?? 0)} hint="Next 7 days" icon={CalendarClock} loading={myKpisLoading} />
            <StatTile label="Open tasks" countTo={p?.openTasks ?? 0} value={String(p?.openTasks ?? 0)} hint="Assigned to you, not yet done" icon={CheckSquare} loading={personalLoading} />
            <StatTile label="Clients" countTo={my?.myClients ?? 0} value={String(my?.myClients ?? 0)} hint="Across matters you lead" icon={Users} loading={myKpisLoading} />
            <StatTile label="Billable hours" value={`${p?.billableHoursMTD ?? 0}h`} hint="This month" icon={Clock} loading={personalLoading} />
            <StatTile label="Logged expenses" value={formatMoneyCompact(p?.expensesMTD ?? 0)} hint="This month" icon={Receipt} loading={personalLoading} />
          </>
        )}
      </div>

      {/* Your tasks — its own full-width section, not squeezed into the two-column grid below */}
      <div className="mt-6">
        <YourTasksCard />
      </div>

      {/* Trend chart + insights */}
      <div className="mt-6 space-y-4">
        <DateRangeControl
          range={dateRange.range}
          onPresetChange={dateRange.setPreset}
          onCustomFromChange={dateRange.setCustomFrom}
          onCustomToChange={dateRange.setCustomTo}
        />
        <div className="grid gap-6 lg:grid-cols-3">
          {canFinancials ? <FirmActivityCard range={dateRange.range} /> : <BillableHoursCard range={dateRange.range} />}

          {/* Insights — rule-based risk & opportunity scan over the firm's live data */}
          <Card className="relative overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  'radial-gradient(24rem 24rem at 100% 0%, hsl(var(--primary) / 0.10), transparent 60%)',
              }}
            />
            <CardHeader className="relative flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-lg">Insights</CardTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">From your firm's live data</p>
              </div>
              <Sparkles className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="relative">
              {insightsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
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
                          {insight.detail && (
                            <span className="block truncate text-xs text-muted-foreground">{insight.detail}</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recently updated matters */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Recently updated matters</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">Latest activity across your firm's matters</p>
          </div>
          <History className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {recentMattersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
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
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(m.updated_at), { addSuffix: true })}
                      </span>
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

      <RecentActivityFeed />
    </div>
  )
}
