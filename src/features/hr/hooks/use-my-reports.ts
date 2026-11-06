import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { supabase } from '@/shared/lib/supabase'

/** The people who report to the signed-in user. A line manager approves
 * their leave and endorses their fund requests, whatever their own role. */
export function useMyReports() {
  const { activeOrgId } = useAuth()
  const { data = [], isLoading } = useQuery({
    queryKey: ['hr', 'my-reports', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_direct_reports', { p_org: activeOrgId! })
      if (error) throw error
      return data ?? []
    },
  })
  const userIds = React.useMemo(() => new Set(data.map((r) => r.user_id).filter((u): u is string => Boolean(u))), [data])
  return { reports: data, reportUserIds: userIds, isLineManager: data.length > 0, isLoading }
}
