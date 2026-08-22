import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { MatterRow } from '@/features/matters/types'

export interface RecentMatter extends MatterRow {
  /** "{actor} {summary}" from the matter's most recent timeline event, if any. */
  latestActivity: string | null
}

/** The 5 most recently updated matters, for the dashboard's "recently
 * updated" card. branchId is an optional client-side filter on top of RLS
 * (see useDashboardKpis's own comment). */
export function useRecentMatters(organizationId: string | null, limit = 5, branchId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'recent-matters', organizationId, branchId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<RecentMatter[]> => {
      let q = supabase
        .from('matters')
        .select('*, client:clients(id, display_name, type), lead_lawyer:profiles!matters_lead_lawyer_id_fkey(id, full_name, avatar_url)')
        .eq('organization_id', organizationId!)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (branchId) q = q.eq('branch_id', branchId)
      const { data, error } = await q
      if (error) throw error
      const matters = (data ?? []) as unknown as MatterRow[]
      if (matters.length === 0) return []

      const ids = matters.map((m) => m.id)
      const { data: events, error: eventsErr } = await supabase
        .from('matter_events')
        .select('matter_id, summary, created_at, actor:profiles(full_name)')
        .in('matter_id', ids)
        .order('created_at', { ascending: false })
        .limit(ids.length * 5)
      if (eventsErr) throw eventsErr

      const latestByMatter = new Map<string, string>()
      for (const e of (events ?? []) as unknown as { matter_id: string; summary: string; actor: { full_name: string | null } | null }[]) {
        if (latestByMatter.has(e.matter_id)) continue
        const actor = e.actor?.full_name ?? 'Someone'
        latestByMatter.set(e.matter_id, `${actor} ${e.summary.charAt(0).toLowerCase()}${e.summary.slice(1)}`)
      }

      return matters.map((m) => ({ ...m, latestActivity: latestByMatter.get(m.id) ?? null }))
    },
  })
}
