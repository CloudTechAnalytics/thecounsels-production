import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mattersService } from '@/features/matters/services/matters.service'
import { supabase } from '@/shared/lib/supabase'

export function useMatterEvents(matterId: string | undefined) {
  const qc = useQueryClient()
  const key = ['matter-events', matterId] as const

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(matterId),
    queryFn: () => mattersService.listEvents(matterId!),
  })

  // Automatic entries (hearing scheduled, task added/completed, invoice
  // created, document/note added) are written by DB triggers, not always by
  // this session — Realtime keeps the timeline live regardless of who wrote it.
  useEffect(() => {
    if (!matterId) return
    const channel = supabase
      .channel(`matter-events:${matterId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matter_events', filter: `matter_id=eq.${matterId}` },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId])

  return query
}

export function useAddMatterEvent(organizationId: string | null, matterId: string, actorId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (summary: string) => mattersService.addEvent(organizationId!, matterId, summary, actorId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter-events', matterId] }),
  })
}
