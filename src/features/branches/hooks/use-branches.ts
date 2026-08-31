import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { branchesService } from '@/features/branches/services/branches.service'
import type { BranchFormValues } from '@/features/branches/schemas'
import type { AccessScope } from '@/shared/types/database.types'

const keys = {
  list: (orgId: string) => ['branches', orgId] as const,
  withStats: (orgId: string) => ['branches', orgId, 'stats'] as const,
  members: (orgId: string, branchId: string) => ['branches', orgId, branchId, 'members'] as const,
  memberBranches: (membershipId: string) => ['member-branches', membershipId] as const,
}

export function useBranches(organizationId: string | null) {
  return useQuery({
    queryKey: keys.list(organizationId ?? 'none'),
    enabled: Boolean(organizationId),
    queryFn: () => branchesService.list(organizationId!),
  })
}

export function useBranchesWithStats(organizationId: string | null) {
  return useQuery({
    queryKey: keys.withStats(organizationId ?? 'none'),
    enabled: Boolean(organizationId),
    queryFn: () => branchesService.listWithStats(organizationId!),
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['branches', organizationId] })
  }
}

export function useCreateBranch(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (values: BranchFormValues) => branchesService.create(organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useUpdateBranch(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: BranchFormValues }) => branchesService.update(id, organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useSetBranchActive(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, name, isActive }: { id: string; name: string; isActive: boolean }) =>
      branchesService.setActive(id, organizationId!, name, isActive),
    onSuccess: invalidate,
  })
}

export function useDeleteBranch(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => branchesService.remove(id, organizationId!, name),
    onSuccess: invalidate,
  })
}

export function useSetHeadOffice(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ branchId, name }: { branchId: string; name: string }) => branchesService.setHeadOffice(organizationId!, branchId, name),
    onSuccess: invalidate,
  })
}

export function useBranchMembers(organizationId: string | null, branchId: string | null) {
  return useQuery({
    queryKey: keys.members(organizationId ?? 'none', branchId ?? 'none'),
    enabled: Boolean(organizationId && branchId),
    queryFn: () => branchesService.listMembers(organizationId!, branchId!),
  })
}

export function useAssignMemberToBranch(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, branchId, assignedBy }: { membershipId: string; branchId: string; assignedBy: string | null }) =>
      branchesService.assignMember(organizationId!, membershipId, branchId, assignedBy),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.members(organizationId ?? 'none', vars.branchId) })
      qc.invalidateQueries({ queryKey: keys.withStats(organizationId ?? 'none') })
      qc.invalidateQueries({ queryKey: keys.memberBranches(vars.membershipId) })
    },
  })
}

export function useRemoveMemberFromBranch(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, branchId }: { membershipId: string; branchId: string }) =>
      branchesService.removeMember(organizationId!, membershipId, branchId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: keys.members(organizationId ?? 'none', vars.branchId) })
      qc.invalidateQueries({ queryKey: keys.withStats(organizationId ?? 'none') })
      qc.invalidateQueries({ queryKey: keys.memberBranches(vars.membershipId) })
    },
  })
}

export function useMemberBranches(membershipId: string | null) {
  return useQuery({
    queryKey: keys.memberBranches(membershipId ?? 'none'),
    enabled: Boolean(membershipId),
    queryFn: () => branchesService.listMemberBranches(membershipId!),
  })
}

export function useUpdateMemberAccess(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      membershipId,
      accessScope,
      branchIds,
      assignedBy,
    }: {
      membershipId: string
      accessScope: AccessScope
      branchIds: string[]
      assignedBy: string | null
    }) => branchesService.updateMemberAccess(organizationId!, membershipId, accessScope, branchIds, assignedBy),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
      qc.invalidateQueries({ queryKey: keys.memberBranches(vars.membershipId) })
      qc.invalidateQueries({ queryKey: keys.withStats(organizationId ?? 'none') })
    },
  })
}
