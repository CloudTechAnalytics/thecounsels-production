import * as React from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { documentsService, type DocumentFilters } from '@/features/documents/services/documents.service'
import type { DocumentRow } from '@/shared/types/database.types'
import { useInvalidateStorageUsage } from '@/shared/hooks/use-storage-quota'

/** Paginated (200/page) — a firm with decades of migrated records can
 * easily exceed Postgres/PostgREST's default row cap, so this always pages
 * rather than trusting one unbounded fetch to return everything. */
export function useDocuments(organizationId: string | null, filters: DocumentFilters) {
  const query = useInfiniteQuery({
    queryKey: ['org-documents', organizationId, filters],
    enabled: Boolean(organizationId),
    queryFn: ({ pageParam }) => documentsService.list(organizationId!, filters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length : undefined),
  })
  const data = React.useMemo(() => query.data?.pages.flatMap((p) => p.rows), [query.data])
  return { ...query, data }
}

/** Custom categories the firm has actually typed in, so they resurface as
 * suggestions/filters instead of being a one-off. */
export function useDocumentCategories(organizationId: string | null) {
  return useQuery({
    queryKey: ['org-documents', organizationId, 'categories'],
    enabled: Boolean(organizationId),
    queryFn: () => documentsService.listCategories(organizationId!),
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return (matterId?: string | null) => {
    qc.invalidateQueries({ queryKey: ['org-documents', organizationId] })
    if (matterId) qc.invalidateQueries({ queryKey: ['matter-summary', matterId] })
    invalidateStorage()
  }
}

export function useUploadDocuments(organizationId: string | null, uploadedBy: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (params: { file: File; matterId?: string | null; category?: string | null; displayName?: string }) =>
      documentsService.upload({ organizationId: organizationId!, uploadedBy, ...params }),
    onSuccess: (_d, vars) => invalidate(vars.matterId),
  })
}

export function useUpdateDocument(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ doc, patch }: { doc: DocumentRow; patch: { display_name?: string; category?: string | null } }) =>
      documentsService.update(doc, patch),
    onSuccess: (_d, vars) => invalidate(vars.doc.matter_id),
  })
}

export function useDeleteOrgDocument(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (doc: DocumentRow) => documentsService.remove(doc),
    onSuccess: (_d, doc) => invalidate(doc.matter_id),
  })
}
