import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supportService, type TicketFilters } from '@/features/support/services/support.service'

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
