import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { administrationService } from '@/features/administration/services/administration.service'

const keys = {
  organizations: ['administration', 'organizations'] as const,
  roles: ['administration', 'assignable-roles'] as const,
  invitations: (orgId: string) => ['administration', 'invitations', orgId] as const,
  members: (orgId: string) => ['administration', 'members', orgId] as const,
  myInvitations: ['administration', 'my-invitations'] as const,
}

export function useOrganizations(enabled = true) {
  return useQuery({
    queryKey: keys.organizations,
    queryFn: () => administrationService.listOrganizations(),
    enabled,
  })
}

export function useAssignableRoles() {
  return useQuery({
    queryKey: keys.roles,
    queryFn: () => administrationService.listAssignableRoles(),
    staleTime: 5 * 60_000,
  })
}

export function useInvitations(organizationId: string | null) {
  return useQuery({
    queryKey: keys.invitations(organizationId ?? 'none'),
    queryFn: () => administrationService.listInvitations(organizationId!),
    enabled: Boolean(organizationId),
  })
}

export function useMembers(organizationId: string | null) {
  return useQuery({
    queryKey: keys.members(organizationId ?? 'none'),
    queryFn: () => administrationService.listMembers(organizationId!),
    enabled: Boolean(organizationId),
  })
}

export function useMyPendingInvitations(enabled = true) {
  return useQuery({
    queryKey: keys.myInvitations,
    queryFn: () => administrationService.listMyPendingInvitations(),
    enabled,
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: administrationService.createOrganization,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.organizations }),
  })
}

export function useCreateInvitation(organizationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: administrationService.createInvitation,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(organizationId) }),
  })
}

export function useRevokeInvitation(organizationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: administrationService.revokeInvitation,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.invitations(organizationId) }),
  })
}

export function useSubscription(organizationId: string | null) {
  return useQuery({
    queryKey: ['administration', 'subscription', organizationId ?? 'none'],
    enabled: Boolean(organizationId),
    queryFn: () => administrationService.getSubscription(organizationId!),
  })
}

function useInvalidateSubscription(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['administration', 'subscription', organizationId ?? 'none'] })
    qc.invalidateQueries({ queryKey: ['billing-callback-subscription', organizationId ?? 'none'] })
  }
}

export function useScheduleDowngrade(organizationId: string | null) {
  const invalidate = useInvalidateSubscription(organizationId)
  return useMutation({
    mutationFn: (planId: string) => administrationService.scheduleDowngrade(organizationId!, planId),
    onSuccess: invalidate,
  })
}

export function useCancelScheduledDowngrade(organizationId: string | null) {
  const invalidate = useInvalidateSubscription(organizationId)
  return useMutation({
    mutationFn: () => administrationService.cancelScheduledDowngrade(organizationId!),
    onSuccess: invalidate,
  })
}

export function useCancelSubscription(organizationId: string | null) {
  const invalidate = useInvalidateSubscription(organizationId)
  return useMutation({
    mutationFn: (reason: string | undefined) => administrationService.cancelSubscription(organizationId!, reason),
    onSuccess: invalidate,
  })
}

export function useRolesWithPermissions() {
  return useQuery({
    queryKey: ['administration', 'roles-permissions'],
    queryFn: () => administrationService.listRolesWithPermissions(),
  })
}

export function useUpdateOrganization(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Parameters<typeof administrationService.updateOrganization>[1]) =>
      administrationService.updateOrganization(organizationId!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['administration'] }),
  })
}

export function useUpdateOrganizationSlug(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => administrationService.updateOrganizationSlug(organizationId!, slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['administration'] }),
  })
}

export function useUploadOrganizationLogo(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => administrationService.uploadOrganizationLogo(organizationId!, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['administration'] }),
  })
}

export function useRemoveMember(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, name }: { membershipId: string; name: string }) =>
      administrationService.removeMember(membershipId, organizationId!, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
      qc.invalidateQueries({ queryKey: ['firm-members', organizationId] })
    },
  })
}
