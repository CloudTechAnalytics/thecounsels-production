import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import {
  Globe,
  Users2,
  ShieldCheck,
  Zap,
  Activity,
  Building2,
  TrendingUp,
  Banknote,
  CircleDollarSign,
  LifeBuoy,
} from 'lucide-react'
import { formatMoneyCompact } from '@/shared/lib/format'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  usePlatformStats,
  usePlatformOrganizations,
  usePlatformActivity,
  useOrganizationGrowth,
} from '@/features/platform/hooks/use-platform'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { GrowthChart } from '@/features/platform/components/growth-chart'
import { PlatformHealth } from '@/features/platform/components/platform-health'
import { CreateOrganizationDialog } from '@/features/platform/components/create-organization-dialog'
import { PageHeader } from '@/shared/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { initialsOf, titleCase } from '@/shared/lib/format'

export function PlatformDashboardPage() {
  const { profile } = useAuth()
  const stats = usePlatformStats()
  const orgs = usePlatformOrganizations()
  const activity = usePlatformActivity()
  const growth = useOrganizationGrowth()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const s = stats.data

  return (
    <div>
      <PageHeader
        title="Platform Console"
        description={`Welcome back, ${firstName}. Manage organizations, users, security and platform services.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/platform/audit">Audit Logs</Link>
            </Button>
            <CreateOrganizationDialog />
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Organizations" value={s?.totalOrganizations ?? 0} hint="Customer firms" icon={Globe} loading={stats.isLoading} />
        <KpiCard label="Paid Orgs" value={s?.paidOrganizations ?? 0} hint="Active plans" icon={Building2} loading={stats.isLoading} />
        <KpiCard label="Trial Orgs" value={s?.trialOrganizations ?? 0} hint="On trial" icon={Building2} loading={stats.isLoading} />
        <KpiCard label="Suspended" value={s?.suspendedOrganizations ?? 0} hint="Paused firms" icon={Building2} loading={stats.isLoading} />
        <KpiCard label="MRR" value={formatMoneyCompact(s?.mrr ?? 0)} hint="Monthly recurring" icon={Banknote} loading={stats.isLoading} />
        <KpiCard label="ARR" value={formatMoneyCompact(s?.arr ?? 0)} hint="Annual recurring" icon={CircleDollarSign} loading={stats.isLoading} />
      </div>

      {/* Secondary status row */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Users" value={s?.totalUsers ?? 0} icon={Users2} loading={stats.isLoading} />
        <KpiCard label="Platform Team" value={s?.platformUsers ?? 0} icon={ShieldCheck} loading={stats.isLoading} />
        <KpiCard label="Active Today" value={s?.signedInToday ?? 0} icon={Zap} loading={stats.isLoading} />
        <KpiCard label="New This Month" value={s?.organizationsThisMonth ?? 0} icon={TrendingUp} loading={stats.isLoading} />
        <KpiCard label="Support Tickets" value={0} icon={LifeBuoy} loading={stats.isLoading} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Organizations preview */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-4 w-4 text-muted-foreground" /> Organizations
              </CardTitle>
              <Button asChild variant="link" size="sm">
                <Link to="/platform/organizations">Manage all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {orgs.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : orgs.data && orgs.data.length > 0 ? (
                <ul className="divide-y divide-border/70">
                  {orgs.data.slice(0, 5).map((org) => (
                    <li key={org.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">
                        {initialsOf(org.name, 'OR')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{org.name}</p>
                        <p className="truncate text-xs text-muted-foreground">/{org.slug}</p>
                      </div>
                      <span className="text-sm text-muted-foreground">{org.member_count} members</span>
                      <Badge variant={org.status === 'active' ? 'success' : 'muted'}>{org.status}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No organizations yet — create your first firm to get started.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Growth */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-4 w-4 text-muted-foreground" /> Organization Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              {growth.isLoading ? <Skeleton className="h-56 w-full" /> : <GrowthChart data={growth.data ?? []} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <PlatformHealth reachable={!stats.isError} />

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-4 w-4 text-muted-foreground" /> Latest Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activity.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : activity.data && activity.data.length > 0 ? (
                <ul className="space-y-3">
                  {activity.data.slice(0, 6).map((a) => (
                    <li key={a.id}>
                      <p className="text-sm font-medium leading-tight">
                        {a.summary ?? titleCase(a.action.replace('.', ' '))}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
