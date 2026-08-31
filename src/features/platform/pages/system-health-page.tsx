import { format } from 'date-fns'
import { Activity, RefreshCw, Building2, Users, HardDrive, ScrollText, Database } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { healthService, type ServiceStatus } from '@/features/platform/services/health.service'
import { usePlatformOrganizations, usePlatformStats, usePlatformResourceUsage } from '@/features/platform/hooks/use-platform'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Progress } from '@/shared/components/ui/progress'
import { formatStorage } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const STATUS_META: Record<ServiceStatus, { label: string; dot: string; variant: 'success' | 'warning' | 'destructive' }> = {
  operational: { label: 'Operational', dot: 'bg-success', variant: 'success' },
  degraded: { label: 'Degraded', dot: 'bg-warning', variant: 'warning' },
  down: { label: 'Down', dot: 'bg-destructive', variant: 'destructive' },
}

export function SystemHealthPage() {
  const { data: report, isFetching, refetch } = useQuery({
    queryKey: ['platform', 'health'],
    queryFn: () => healthService.runChecks(),
    refetchInterval: 60_000,
  })
  const { data: stats, isLoading: statsLoading } = usePlatformStats()
  const { data: orgs } = usePlatformOrganizations()
  const { data: usage, isLoading: usageLoading } = usePlatformResourceUsage()

  const checks = report?.checks ?? []
  const worst: ServiceStatus = checks.some((c) => c.status === 'down')
    ? 'down'
    : checks.some((c) => c.status === 'degraded')
      ? 'degraded'
      : 'operational'
  const storageUsed = (orgs ?? []).reduce((s, o) => s + (o.storage_used_bytes ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="System Health"
        description="Live checks against every service the platform depends on — measured from your browser."
        actions={
          <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw /> Run checks
          </Button>
        }
      />

      {report && (
        <Card className={cn('mb-6 flex items-center justify-between px-5 py-4', worst === 'down' && 'border-destructive/40')}>
          <div className="flex items-center gap-3">
            <span className={cn('relative flex h-3 w-3')}>
              <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', STATUS_META[worst].dot)} />
              <span className={cn('relative inline-flex h-3 w-3 rounded-full', STATUS_META[worst].dot)} />
            </span>
            <p className="font-medium">
              {worst === 'operational' ? 'All systems operational' : worst === 'degraded' ? 'Some services are slow' : 'Service disruption detected'}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Last checked {format(new Date(report.checkedAt), 'HH:mm:ss')} · auto-refreshes every minute
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {checks.length === 0
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)
          : checks.map((c) => (
              <Card key={c.key} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{c.label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{c.description}</p>
                  </div>
                  <Badge variant={STATUS_META[c.status].variant}>{STATUS_META[c.status].label}</Badge>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  {c.latencyMs != null ? (
                    <>Round-trip <span className="font-medium text-foreground">{c.latencyMs}ms</span></>
                  ) : (
                    'No response'
                  )}
                </p>
              </Card>
            ))}
      </div>

      <h2 className="mb-4 mt-8 font-display text-lg font-semibold">Supabase plan usage</h2>
      <Card className="p-5">
        {usageLoading || !usage ? (
          <div className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium"><Database className="h-4 w-4 text-muted-foreground" /> Database</span>
                <span className="text-muted-foreground">
                  {formatStorage(usage.dbBytes)} of {formatStorage(usage.dbCapBytes)} ({usage.dbPct}%)
                </span>
              </div>
              <Progress value={usage.dbPct} className="mt-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium"><HardDrive className="h-4 w-4 text-muted-foreground" /> Storage</span>
                <span className="text-muted-foreground">
                  {formatStorage(usage.storageBytes)} of {formatStorage(usage.storageCapBytes)} ({usage.storagePct}%)
                </span>
              </div>
              <Progress value={usage.storagePct} className="mt-2" />
            </div>
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Against the current Supabase plan cap (update it in the database once you upgrade). A daily automated check
          emails every platform admin the moment either crosses 70% — this view is just the on-demand version of that
          same check.
        </p>
      </Card>

      <h2 className="mb-4 mt-8 font-display text-lg font-semibold">Platform usage</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Organizations" value={stats?.totalOrganizations ?? 0} hint="Active law firms" icon={Building2} loading={statsLoading} />
        <KpiCard label="Users" value={stats?.totalUsers ?? 0} hint="Across all firms" icon={Users} loading={statsLoading} />
        <KpiCard label="Storage used" value={formatStorage(storageUsed)} hint="Documents, avatars & logos" icon={HardDrive} loading={!orgs} />
        <KpiCard label="Audit events" value={stats?.auditEvents ?? 0} hint="Recorded platform-wide" icon={ScrollText} loading={statsLoading} />
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        Checks run from your browser session, so numbers include your network latency. For server-side uptime monitoring,
        pair this with an external probe (e.g. UptimeRobot) against the same endpoints.
      </p>
    </div>
  )
}
