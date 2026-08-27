import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataExportService } from '@/features/administration/services/data-export.service'
import { supabase } from '@/shared/lib/supabase'

export function useDataExportRequests(organizationId: string | null) {
  const qc = useQueryClient()
  const key = ['data-export-requests', organizationId ?? 'none']
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(organizationId),
    queryFn: () => dataExportService.listRequests(organizationId!),
    // A ready/failed export doesn't need continued polling; a
    // pending/processing one does, since generate-data-export runs
    // synchronously server-side and this is how the UI finds out it's done.
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'processing' || r.status === 'pending') ? 3000 : false),
  })

  React.useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel(`data-export-requests:${organizationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'data_export_requests', filter: `organization_id=eq.${organizationId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, qc])

  return query
}

export function useRequestDataExport(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => dataExportService.requestExport(organizationId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-export-requests', organizationId ?? 'none'] }),
  })
}
