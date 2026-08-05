import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mattersService, type MatterFilters } from '@/features/matters/services/matters.service'
import { administrationService } from '@/features/administration/services/administration.service'
import type { MatterFormValues } from '@/features/matters/schemas'

export function useMatters(organizationId: string | null, filters: MatterFilters) {
  return useQuery({
    queryKey: ['matters', organizationId, filters],
    enabled: Boolean(organizationId),
    queryFn: () => mattersService.list(organizationId!, filters),
  })
}

export function useMatter(id: string | undefined) {
  return useQuery({
    queryKey: ['matter', id],
    enabled: Boolean(id),
    queryFn: () => mattersService.get(id!),
  })
}

/** Firm members, used to populate the lead-lawyer selector. */
export function useFirmMembers(organizationId: string | null) {
  return useQuery({
    queryKey: ['firm-members', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => administrationService.listMembers(organizationId!),
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['matters', organizationId] })
    qc.invalidateQueries({ queryKey: ['matter'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }
}

export function useCreateMatter(organizationId: string | null, createdBy: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (values: MatterFormValues) => mattersService.create(organizationId!, values, createdBy),
    onSuccess: invalidate,
  })
}

export function useUpdateMatter(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: MatterFormValues }) =>
      mattersService.update(id, organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useDeleteMatter(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) => mattersService.remove(id, organizationId!, label),
    onSuccess: invalidate,
  })
}

// Team assignments ------------------------------------------------------------
export function useMatterAssignments(matterId: string | undefined) {
  return useQuery({
    queryKey: ['matter-assignments', matterId],
    enabled: Boolean(matterId),
    queryFn: () => mattersService.listAssignments(matterId!),
  })
}

function useInvalidateAssignments(matterId: string | undefined) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['matter-assignments', matterId] })
    qc.invalidateQueries({ queryKey: ['matter', matterId] })
    qc.invalidateQueries({ queryKey: ['matter-events', matterId] })
    qc.invalidateQueries({ queryKey: ['matters'] })
  }
}

export function useAssignMatterMember(organizationId: string | null, matterId: string | undefined, assignedBy: string | null) {
  const invalidate = useInvalidateAssignments(matterId)
  return useMutation({
    mutationFn: (userId: string) => mattersService.assignMember(organizationId!, matterId!, userId, assignedBy),
    onSuccess: invalidate,
  })
}

export function useUnassignMatterMember(matterId: string | undefined) {
  const invalidate = useInvalidateAssignments(matterId)
  return useMutation({
    mutationFn: (userId: string) => mattersService.unassignMember(matterId!, userId),
    onSuccess: invalidate,
  })
}
