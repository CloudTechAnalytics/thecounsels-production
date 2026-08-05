import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mattersService } from '@/features/matters/services/matters.service'

export function useMatterNotes(matterId: string | undefined) {
  return useQuery({
    queryKey: ['matter-notes', matterId],
    enabled: Boolean(matterId),
    queryFn: () => mattersService.listNotes(matterId!),
  })
}

export function useAddNote(organizationId: string | null, matterId: string, authorId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => mattersService.addNote(organizationId!, matterId, body, authorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matter-notes', matterId] })
      qc.invalidateQueries({ queryKey: ['matter-summary', matterId] })
    },
  })
}

export function useUpdateNote(matterId: string, editedBy: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => mattersService.updateNote(id, body, editedBy),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matter-notes', matterId] })
      qc.invalidateQueries({ queryKey: ['matter-events', matterId] })
    },
  })
}

export function useDeleteNote(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => mattersService.deleteNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matter-notes', matterId] })
      qc.invalidateQueries({ queryKey: ['matter-summary', matterId] })
    },
  })
}
