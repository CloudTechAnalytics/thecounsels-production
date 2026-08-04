import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { MatterRow } from '@/features/matters/types'

/** The 5 most recently updated matters, for the dashboard's "recently updated" card. */
export function useRecentMatters(organizationId: string | null, limit = 5) {
  return useQuery({
    queryKey: ['dashboard', 'recent-matters', organizationId],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<MatterRow[]> => {
      const { data, error } = await supabase
        .from('matters')
        .select('*, client:clients(id, display_name, type), lead_lawyer:profiles!matters_lead_lawyer_id_fkey(id, full_name, avatar_url)')
        .eq('organization_id', organizationId!)
        .order('updated_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as MatterRow[]
    },
  })
}
