import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { fundsService } from '@/features/funds/services/funds.service'
import { useInvalidateStorageUsage } from '@/shared/hooks/use-storage-quota'
import type { FundRequest, FundSettings } from '@/features/funds/types'

export function useFundSettings(organizationId: string | null) {
  return useQuery({
    queryKey: ['funds', 'settings', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => fundsService.getSettings(organizationId!),
  })
}

export function useSaveFundSettings(organizationId: string | null) {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: (patch: Pick<FundSettings, 'require_line_manager' | 'leadership_threshold' | 'retirement_due_days'>) =>
      fundsService.saveSettings(organizationId!, patch, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funds', 'settings', organizationId] }),
  })
}

export function useFundRequests(organizationId: string | null) {
  return useQuery({
    queryKey: ['funds', 'requests', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => fundsService.listRequests(organizationId!),
  })
}

function useInvalidateFunds(organizationId: string | null) {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['funds', 'requests', organizationId] })
}

export function useSubmitFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: (input: Parameters<typeof fundsService.submitRequest>[1]) => fundsService.submitRequest(organizationId!, input),
    onSuccess: invalidate,
  })
}

export function useActOnFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, approve, comment }: { id: string; approve: boolean; comment?: string }) => fundsService.act(id, approve, comment),
    onSuccess: invalidate,
  })
}

export function useCancelFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (id: string) => fundsService.cancel(id), onSuccess: invalidate })
}

export function useDisburseFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, amount, method, reference }: { id: string; amount: number; method?: string; reference?: string }) =>
      fundsService.disburse(id, amount, method, reference),
    onSuccess: invalidate,
  })
}

export function useAddRetirementItem(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: (p: { requestId: string; description: string; amount: number; spentOn?: string; receipt?: File | null }) =>
      fundsService.addRetirementItem({ organizationId: organizationId!, ...p }),
    onSuccess: () => { invalidate(); invalidateStorage() },
  })
}

export function useDeleteRetirementItem(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: fundsService.deleteRetirementItem,
    onSuccess: () => { invalidate(); invalidateStorage() },
  })
}

export function useSubmitRetirement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => fundsService.submitRetirement(id, note),
    onSuccess: invalidate,
  })
}

export function useReviewRetirement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, accept, comment }: { id: string; accept: boolean; comment?: string }) => fundsService.reviewRetirement(id, accept, comment),
    onSuccess: invalidate,
  })
}

/** Mirrors act_on_fund_request()'s server-side check, so the UI only
 * offers Approve/Reject to whoever the database will actually accept. */
export function useFundApprovalRights() {
  const { userId, activeMembership } = useAuth()
  const { has } = usePermissions()
  const roleKey = activeMembership?.role.key ?? null
  const canApprove = has('funds.approve')

  const canActOn = React.useCallback((r: FundRequest) => {
    if (r.status !== 'pending' || !userId) return false
    const step = r.approvals.find((a) => a.status === 'pending')
    if (!step) return false
    const ownButTop = r.user_id !== userId || roleKey === 'managing_partner'
    if (step.stage === 'line_manager') return step.approver_id === userId
    if (step.stage === 'approver') return canApprove && ownButTop
    return (roleKey === 'managing_partner' || roleKey === 'partner') && ownButTop
  }, [userId, roleKey, canApprove])

  return { canActOn }
}
