import { Building2, UserPlus, Users2, Zap } from 'lucide-react'
import {
  useOrganizationGrowth,
  useSubscriptions,
  usePlatformStats,
} from '@/features/platform/hooks/use-platform'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { GrowthChart } from '@/features/platform/components/growth-chart'
import { BarChart, DistributionBars } from '@/shared/components/bar-chart'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

export function AnalyticsPage() {
  const growth = useOrganizationGrowth()
  const subs = useSubscriptions()
  const stats = usePlatformStats()

  // Derive per-month signups by differencing the cumulative growth series.
  const signups = (growth.data ?? []).map((point, i, arr) => ({
    label: point.label,
    value: i === 0 ? point.value : point.value - arr[i - 1].value,
  }))

  const planDistribution = Object.values(
    (subs.data ?? []).reduce<Record<string, { label: string; value: number }>>((acc, s) => {
      const name = s.plan?.name ?? 'Unassigned'
      acc[name] ??= { label: name, value: 0 }
      acc[name].value += 1
      return acc
    }, {}),
  ).sort((a, b) => b.value - a.value)

  const statusSplit = [
    { label: 'Paid', value: stats.data?.paidOrganizations ?? 0 },
    { label: 'Trial', value: stats.data?.trialOrganizations ?? 0 },
    { label: 'Suspended', value: stats.data?.suspendedOrganizations ?? 0 },
  ]

  return (
    <div>
      <PageHeader title="Platform Analytics" description="Growth, adoption and activity across all tenants." />

      <div className="grid grid-flow-col auto-cols-[minmax(150px,1fr)] gap-4 overflow-x-auto pb-1">
        <KpiCard label="Organizations" value={stats.data?.totalOrganizations ?? 0} icon={Building2} loading={stats.isLoading} />
        <KpiCard label="New This Month" value={stats.data?.organizationsThisMonth ?? 0} icon={UserPlus} loading={stats.isLoading} />
        <KpiCard label="Total Users" value={stats.data?.totalUsers ?? 0} icon={Users2} loading={stats.isLoading} />
        <KpiCard label="Active Today" value={stats.data?.signedInToday ?? 0} icon={Zap} loading={stats.isLoading} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-4 text-sm font-semibold">Organization growth</h2>
        {growth.isLoading ? <Skeleton className="h-56 w-full" /> : <GrowthChart data={growth.data ?? []} />}
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Monthly signups</h2>
          {growth.isLoading ? <Skeleton className="h-56 w-full" /> : <BarChart data={signups} />}
        </Card>
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold">Plan distribution</h2>
          {subs.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : planDistribution.length ? (
            <DistributionBars data={planDistribution} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No subscriptions yet.</p>
          )}
        </Card>
      </div>

      <Card className="mt-5 p-6">
        <h2 className="mb-4 text-sm font-semibold">Organizations by status</h2>
        <DistributionBars data={statusSplit} />
      </Card>
    </div>
  )
}
