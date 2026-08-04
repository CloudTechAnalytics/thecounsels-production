import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export interface DashboardKpis {
  activeMatters: number
  hearingsThisWeek: number
  activeClients: number
}

/** Matter and hearing counts for the dashboard KPI tiles. */
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
        supabase
          .from('matters')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId!)
          .in('status', ['open', 'pending', 'in_court']),
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

      return {
        activeMatters: matters.count ?? 0,
        hearingsThisWeek: hearings.count ?? 0,
        activeClients: clients.count ?? 0,
      }
    },
  })
}
