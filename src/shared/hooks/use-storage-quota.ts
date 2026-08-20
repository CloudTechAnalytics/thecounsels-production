import { useQuery, useQueryClient } from '@tanstack/react-query'
import { storageQuotaService } from '@/shared/services/storage-quota.service'

const keys = {
  usage: (orgId: string) => ['storage-quota', 'usage', orgId] as const,
  limit: (orgId: string) => ['storage-quota', 'limit', orgId] as const,
  breakdown: (orgId: string) => ['storage-quota', 'breakdown', orgId] as const,
  largestFiles: (orgId: string) => ['storage-quota', 'largest-files', orgId] as const,
}

/** Used + limit together — the headline "X of Y used" figure and the % bar. */
export function useStorageUsage(organizationId: string | null) {
  const usedQuery = useQuery({
    queryKey: keys.usage(organizationId ?? 'none'),
    queryFn: () => storageQuotaService.getUsage(organizationId!),
    enabled: Boolean(organizationId),
  })
  const limitQuery = useQuery({
    queryKey: keys.limit(organizationId ?? 'none'),
    queryFn: () => storageQuotaService.getLimit(organizationId!),
    enabled: Boolean(organizationId),
  })
  return {
    usedBytes: usedQuery.data ?? 0,
    limitBytes: limitQuery.data ?? 0,
    isLoading: usedQuery.isLoading || limitQuery.isLoading,
  }
}

export function useStorageBreakdown(organizationId: string | null) {
  return useQuery({
    queryKey: keys.breakdown(organizationId ?? 'none'),
    queryFn: () => storageQuotaService.getBreakdown(organizationId!),
    enabled: Boolean(organizationId),
  })
}

export function useLargestFiles(organizationId: string | null) {
  return useQuery({
    queryKey: keys.largestFiles(organizationId ?? 'none'),
    queryFn: () => storageQuotaService.getLargestFiles(organizationId!),
    enabled: Boolean(organizationId),
  })
}

/** Called from each upload/delete mutation's onSuccess (documents, receipts,
 * HR documents) so the Storage tab and any pre-upload hint stay live without
 * a full page reload. */
export function useInvalidateStorageUsage(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    if (!organizationId) return
    qc.invalidateQueries({ queryKey: ['storage-quota', 'usage', organizationId] })
    qc.invalidateQueries({ queryKey: ['storage-quota', 'breakdown', organizationId] })
    qc.invalidateQueries({ queryKey: ['storage-quota', 'largest-files', organizationId] })
  }
}
