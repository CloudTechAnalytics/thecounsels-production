import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export interface DashboardKpis {
  activeMatters: number
  openMatters: number
  mattersInCourt: number
  hearingsThisWeek: number
  activeClients: number
}

/** Firm-wide matter/hearing/client counts for the dashboard KPI tiles. */
export function useDashboardKpis(organizationId: string | null) {
  return useQuery({
    queryKey: ['dashboard', 'kpis', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<DashboardKpis> => {
      // Rolling window: today 00:00 through the next 7 days.
      const weekStart = new Date()
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 7)

      const [matters, hearings, clients] = await Promise.all([
        // One query for all three matter-status KPIs — cheaper than three count-head queries.
        supabase.from('matters').select('status').eq('organization_id', organizationId!),
        supabase
          .from('hearings')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId!)
          .neq('status', 'cancelled')
          .gte('hearing_at', weekStart.toISOString())
          .lt('hearing_at', weekEnd.toISOString()),
        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId!)
          .eq('status', 'active'),
      ])
      if (matters.error) throw matters.error
      if (hearings.error) throw hearings.error
      if (clients.error) throw clients.error

      const statuses = (matters.data ?? []).map((m) => m.status)
      return {
        activeMatters: statuses.filter((s) => s === 'open' || s === 'pending' || s === 'in_court').length,
        openMatters: statuses.filter((s) => s === 'open').length,
        mattersInCourt: statuses.filter((s) => s === 'in_court').length,
        hearingsThisWeek: hearings.count ?? 0,
        activeClients: clients.count ?? 0,
      }
    },
  })
}
