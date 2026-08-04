import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hearingsService, type HearingFilters } from '@/features/hearings/services/hearings.service'
import type { HearingFormValues } from '@/features/hearings/schemas'

export function useHearings(organizationId: string | null, filters: HearingFilters = {}) {
  return useQuery({
    queryKey: ['hearings', organizationId, filters],
    enabled: Boolean(organizationId),
    queryFn: () => hearingsService.list(organizationId!, filters),
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['hearings', organizationId] })
    qc.invalidateQueries({ queryKey: ['matter-summary'] })
  }
}

export function useCreateHearing(organizationId: string | null, createdBy: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (values: HearingFormValues) => hearingsService.create(organizationId!, values, createdBy),
    onSuccess: invalidate,
  })
}

export function useUpdateHearing(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: HearingFormValues }) =>
      hearingsService.update(id, organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useDeleteHearing(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => hearingsService.remove(id, organizationId!, title),
    onSuccess: invalidate,
  })
}
