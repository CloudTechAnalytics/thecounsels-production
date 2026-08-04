import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Banknote, Briefcase, CheckSquare, Clock, Gavel, Sparkles, TrendingUp, ArrowRight, Users, AlertCircle, History } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useActivityTrend } from '@/features/dashboard/hooks/use-activity-trend'
import { useDashboardKpis } from '@/features/dashboard/hooks/use-dashboard-kpis'
import { useFirmInsights } from '@/features/dashboard/hooks/use-firm-insights'
import { useRecentMatters } from '@/features/dashboard/hooks/use-recent-matters'
import { useBillingStats, usePersonalStats } from '@/features/billing/hooks/use-billing'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { MATTER_STATUS_META } from '@/features/matters/types'
import { formatMoneyCompact, initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { PageHeader } from '@/shared/components/page-header'
import { Sparkline } from '@/shared/components/sparkline'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

export function DashboardPage() {
  const { profile, activeMembership, activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canFinancials = has('reports.financial')
  const { data: trend, isLoading } = useActivityTrend(activeOrgId)
  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis(activeOrgId)
  // Firm revenue is restricted to leadership/finance; others see their own numbers.
  const { data: billing, isLoading: billingLoading } = useBillingStats(canFinancials ? activeOrgId : null)
  const { data: personal, isLoading: personalLoading } = usePersonalStats(canFinancials ? null : activeOrgId, userId)
  const { data: insights, isLoading: insightsLoading } = useFirmInsights(activeOrgId, canFinancials)
  const { data: recentMatters, isLoading: recentMattersLoading } = useRecentMatters(activeOrgId)

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const orgName = activeMembership?.organization.name

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={orgName ? `Here's what's happening at ${orgName} today.` : undefined}
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canFinancials ? (
          <StatTile
            label="Revenue (MTD)"
            value={formatMoneyCompact(billing?.revenueMTD ?? 0)}
            hint="Invoiced this month"
            icon={Banknote}
            loading={billingLoading}
          />
        ) : (
          <StatTile
            label="My billable hours (MTD)"
            value={`${personal?.billableHoursMTD ?? 0}h`}
            hint="Time you logged this month"
            icon={Clock}
            loading={personalLoading}
          />
        )}
        <StatTile
          label="Active matters"
          value={String(kpis?.activeMatters ?? 0)}
          hint="Open, pending or in court"
          icon={Briefcase}
          loading={kpisLoading}
        />
        <StatTile
          label="Hearings this week"
          value={String(kpis?.hearingsThisWeek ?? 0)}
          hint="Next 7 days"
          icon={Gavel}
          loading={kpisLoading}
        />
        {canFinancials ? (
          <StatTile
            label="Billable hours (MTD)"
            value={`${billing?.billableHoursMTD ?? 0}h`}
            hint="Billable time this month"
            icon={Clock}
            loading={billingLoading}
          />
        ) : (
          <StatTile
            label="My open tasks"
            value={String(personal?.openTasks ?? 0)}
            hint="Assigned to you, not yet done"
            icon={CheckSquare}
            loading={personalLoading}
          />
        )}
        <StatTile
          label="Active clients"
          value={String(kpis?.activeClients ?? 0)}
          hint="Currently active"
          icon={Users}
          loading={kpisLoading}
        />
        {canFinancials && (
          <StatTile
            label="Outstanding invoices"
            value={formatMoneyCompact(billing?.outstanding ?? 0)}
            hint="Invoiced, not yet collected"
            icon={AlertCircle}
            loading={billingLoading}
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Activity trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Activity trend</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">Firm momentum over the last 14 days</p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div className="flex items-end gap-6">
                  <div>
                    <p className="font-display text-3xl font-semibold">{trend?.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground">events · 14 days</p>
                  </div>
                  <div className="pb-1">
                    <p className="font-display text-2xl font-semibold">{trend?.today ?? 0}</p>
                    <p className="text-xs text-muted-foreground">today</p>
                  </div>
                </div>
                <Sparkline data={(trend?.points ?? []).map((p) => p.value)} className="mt-4" />
                <div className="mt-4 flex justify-end">
                  <Link
                    to="/notifications"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                  >
                    View live activity <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>

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
                <Skeleton key={i} className="h-12 w-full" />
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
                        </p>
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
            <p className="py-8 text-center text-sm text-muted-foreground">No matters yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
