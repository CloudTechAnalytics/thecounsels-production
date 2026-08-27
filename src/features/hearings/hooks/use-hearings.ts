import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hearingsService, type HearingFilters } from '@/features/hearings/services/hearings.service'
import type { HearingFormValues } from '@/features/hearings/schemas'
import type { HearingStatus } from '@/shared/types/database.types'

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

export function useSetHearingStatus(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, status, title }: { id: string; status: HearingStatus; title: string }) =>
      hearingsService.setStatus(id, organizationId!, status, title),
    onSuccess: invalidate,
  })
}

export function useAdjournHearing(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, title, newHearingAt, reason }: { id: string; title: string; newHearingAt: string; reason: string }) =>
      hearingsService.adjourn(id, organizationId!, title, newHearingAt, reason),
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

export function useHearingSupportingLawyers(hearingId: string | undefined) {
  return useQuery({
    queryKey: ['hearing-supporting-lawyers', hearingId],
    enabled: Boolean(hearingId),
    queryFn: () => hearingsService.listSupportingLawyers(hearingId!),
  })
}

export function useAddHearingSupportingLawyer(organizationId: string | null, hearingId: string, assignedBy: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => hearingsService.addSupportingLawyer(organizationId!, hearingId, userId, assignedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hearing-supporting-lawyers', hearingId] }),
  })
}

export function useRemoveHearingSupportingLawyer(hearingId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => hearingsService.removeSupportingLawyer(hearingId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hearing-supporting-lawyers', hearingId] }),
  })
}
