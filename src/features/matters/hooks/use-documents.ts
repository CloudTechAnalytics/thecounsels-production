import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentsService } from '@/features/matters/services/documents.service'
import type { DocumentRow } from '@/shared/types/database.types'

export function useMatterDocuments(matterId: string | undefined) {
  return useQuery({
    queryKey: ['documents', matterId],
    enabled: Boolean(matterId),
    queryFn: () => documentsService.listByMatter(matterId!),
  })
}

export function useUploadDocument(organizationId: string | null, matterId: string, uploadedBy: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) =>
      documentsService.upload({ organizationId: organizationId!, matterId, file, uploadedBy }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', matterId] })
      qc.invalidateQueries({ queryKey: ['matter-summary', matterId] })
    },
  })
}

export function useDeleteDocument(matterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: DocumentRow) => documentsService.remove(doc),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', matterId] })
      qc.invalidateQueries({ queryKey: ['matter-summary', matterId] })
    },
  })
}
