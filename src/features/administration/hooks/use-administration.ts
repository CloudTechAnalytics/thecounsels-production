import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { administrationService } from '@/features/administration/services/administration.service'
import { planHasFeature, type PlanFeatureKey } from '@/features/administration/lib/plan-features'
import type { BillingCycle } from '@/shared/types/database.types'

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
    // Branch-scoped (0137) — Firm Settings' own roster, not the same
    // unscoped list messaging's recipient picker uses (useFirmMembers).
    queryFn: () => administrationService.listVisibleMembers(organizationId!),
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

/** Mirrors usePermissions()'s shape — `{ has }` — but for plan features
 * instead of role permissions. Backed by the same useSubscription() query
 * every other plan-aware component already calls (react-query dedupes by
 * key, so this doesn't add a second fetch). */
export function usePlanFeature(organizationId: string | null) {
  const { data: subscription, isLoading } = useSubscription(organizationId)
  const { data: overrides, isLoading: overridesLoading } = useFeatureOverrides(organizationId)
  // A platform admin's per-firm override (0202) wins over the plan — same
  // rule as org_has_feature() on the server.
  const overrideOf = (key: PlanFeatureKey): boolean | null => {
    const o = overrides?.find((x) => x.feature === key)
    return o ? o.enabled : null
  }
  return {
    has: (key: PlanFeatureKey) => overrideOf(key) ?? planHasFeature(subscription?.plan?.features, key),
    /** true / false when a platform admin has forced it for this firm, null when it follows the plan. */
    overrideOf,
    isLoading: isLoading || overridesLoading,
  }
}

/** Per-firm feature overrides set in the Platform Console (0202). */
export function useFeatureOverrides(organizationId: string | null) {
  return useQuery({
    queryKey: ['administration', 'feature-overrides', organizationId ?? 'none'],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('organization_feature_overrides').select('*').eq('organization_id', organizationId!)
      if (error) throw error
      return data ?? []
    },
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
    mutationFn: ({ planId, billingCycle }: { planId: string; billingCycle?: BillingCycle }) =>
      administrationService.scheduleDowngrade(organizationId!, planId, billingCycle),
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

export function useSetMembershipStatus(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ membershipId, status, name }: { membershipId: string; status: 'active' | 'suspended'; name: string }) =>
      administrationService.setMembershipStatus(membershipId, organizationId!, status, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
      qc.invalidateQueries({ queryKey: ['firm-members', organizationId] })
    },
  })
}
