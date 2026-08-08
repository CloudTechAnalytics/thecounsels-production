import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export interface MyDashboardKpis {
  myActiveMatters: number
  myClients: number
  myHearingsThisWeek: number
}

const ACTIVE_STATUSES = ['open', 'pending', 'in_court']

/** Senior Associate's own matter/client/hearing counts — matters they lead. */
export function useMyDashboardKpis(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['dashboard', 'my-kpis', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: async (): Promise<MyDashboardKpis> => {
      const { data: myMatters, error: mattersErr } = await supabase
        .from('matters')
        .select('id, status, client_id')
        .eq('organization_id', organizationId!)
        .eq('lead_lawyer_id', userId!)
      if (mattersErr) throw mattersErr

      const myActiveMatters = (myMatters ?? []).filter((m) => ACTIVE_STATUSES.includes(m.status)).length
      const myClients = new Set((myMatters ?? []).map((m) => m.client_id).filter(Boolean)).size
      const matterIds = (myMatters ?? []).map((m) => m.id)

      let myHearingsThisWeek = 0
      if (matterIds.length > 0) {
        const weekStart = new Date()
        weekStart.setHours(0, 0, 0, 0)
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekStart.getDate() + 7)

        const { count, error: hearingsErr } = await supabase
          .from('hearings')
          .select('id', { count: 'exact', head: true })
          .in('matter_id', matterIds)
          .neq('status', 'cancelled')
          .gte('hearing_at', weekStart.toISOString())
          .lt('hearing_at', weekEnd.toISOString())
        if (hearingsErr) throw hearingsErr
        myHearingsThisWeek = count ?? 0
      }

      return { myActiveMatters, myClients, myHearingsThisWeek }
    },
  })
}
