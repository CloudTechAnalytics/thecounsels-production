import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supportService, type TicketFilters } from '@/features/support/services/support.service'
import { supabase } from '@/shared/lib/supabase'

export function useTickets(filters: TicketFilters = {}) {
  return useQuery({
    queryKey: ['support', 'tickets', filters],
    queryFn: () => supportService.listTickets(filters),
  })
}

export function useTicket(id: string | null) {
  return useQuery({
    queryKey: ['support', 'ticket', id],
    enabled: Boolean(id),
    queryFn: () => supportService.getTicket(id!),
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['support'] })
}

export function useCreateTicket() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: supportService.createTicket, onSuccess: invalidate })
}

export function useUpdateTicket() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (args: { id: string; organizationId: string; patch: Parameters<typeof supportService.updateTicket>[2] }) =>
      supportService.updateTicket(args.id, args.organizationId, args.patch),
    onSuccess: invalidate,
  })
}

export function useAddTicketMessage() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (args: { ticketId: string; body: string }) => supportService.addMessage(args.ticketId, args.body),
    onSuccess: invalidate,
  })
}

export function useDeleteTicket() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (args: { id: string; organizationId: string; ticketNumber: string | null }) =>
      supportService.deleteTicket(args.id, args.organizationId, args.ticketNumber),
    onSuccess: invalidate,
  })
}

/** Firm side — realtime-kept-current so a request shows up (and disappears
 * once handled) without a manual refresh. */
export function usePendingSupportSessions(organizationId: string | null) {
  const qc = useQueryClient()
  const key = ['support', 'pending-sessions', organizationId ?? 'none']
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(organizationId),
    queryFn: () => supportService.listPendingSessions(organizationId!),
  })

  React.useEffect(() => {
    if (!organizationId) return
    const channel = supabase
      .channel(`support-sessions:${organizationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_sessions', filter: `organization_id=eq.${organizationId}` },
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

export function useGrantSupportSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supportService.grantSupportSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'pending-sessions'] }),
  })
}

export function useDenySupportSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => supportService.denySupportSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'pending-sessions'] }),
  })
}
