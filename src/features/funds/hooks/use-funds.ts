import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { fundsService, type DisbursementInput, type FundRequestInput } from '@/features/funds/services/funds.service'
import { useInvalidateStorageUsage } from '@/shared/hooks/use-storage-quota'
import type { FundRequest, FundSettings, FundAttachment } from '@/features/funds/types'

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
  return () => {
    qc.invalidateQueries({ queryKey: ['funds', 'requests', organizationId] })
    qc.invalidateQueries({ queryKey: ['funds', 'my-approvals', organizationId] })
  }
}

export function useSaveFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: ({ input, requestId, submit, files }: { input: FundRequestInput; requestId?: string; submit: boolean; files?: File[] }) =>
      fundsService.saveRequest(organizationId!, input, { requestId, submit, files }),
    onSuccess: () => { invalidate(); invalidateStorage() },
    onError: invalidate,
  })
}

export function useDeleteFundDraft(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (id: string) => fundsService.deleteDraft(id), onSuccess: invalidate })
}

export function useDecideFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, decision, comment, amount }: { id: string; decision: 'approve' | 'reject' | 'return'; comment?: string; amount?: number }) =>
      fundsService.decide(id, decision, comment, amount),
    onSuccess: invalidate,
  })
}

export function useCancelFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (id: string) => fundsService.cancel(id), onSuccess: invalidate })
}

export function useMarkPaymentProcessing(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (id: string) => fundsService.markProcessing(id), onSuccess: invalidate })
}

export function useDisburseFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: ({ id, ...d }: DisbursementInput & { id: string }) => fundsService.disburse(organizationId!, id, d),
    onSuccess: () => { invalidate(); invalidateStorage() },
    onError: invalidate,
  })
}

export function useUploadFundAttachment(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: ({ requestId, file }: { requestId: string; file: File }) => fundsService.uploadAttachment(organizationId!, requestId, file, 'supporting'),
    onSuccess: () => { invalidate(); invalidateStorage() },
  })
}

export function useDeleteFundAttachment(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: (a: Pick<FundAttachment, 'id' | 'storage_path'>) => fundsService.deleteAttachment(a),
    onSuccess: () => { invalidate(); invalidateStorage() },
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

export function useRecordRefund(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, ...r }: { id: string; amount: number; receivedOn?: string; method?: string; reference?: string; notes?: string }) =>
      fundsService.recordRefund(id, r),
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

/** Which requests the caller can decide right now. Comes from the server
 * (my_fund_approvals) because roles, permissions, delegation and the
 * self-approval rule all feed into it — the UI never guesses. */
export function useFundApprovalRights() {
  const { activeOrgId } = useAuth()
  const { data } = useQuery({
    queryKey: ['funds', 'my-approvals', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: () => fundsService.myApprovalIds(activeOrgId!),
  })
  const ids = React.useMemo(() => new Set(data ?? []), [data])
  const canActOn = React.useCallback((r: Pick<FundRequest, 'id' | 'status'>) => r.status === 'pending' && ids.has(r.id), [ids])
  return { canActOn }
}

// ---- Workflows & delegation ----
export function useApprovalWorkflows(organizationId: string | null) {
  return useQuery({
    queryKey: ['funds', 'workflows', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => fundsService.listWorkflows(organizationId!),
  })
}

export function useSaveWorkflow(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ wf, steps }: { wf: Parameters<typeof fundsService.saveWorkflow>[1]; steps: Parameters<typeof fundsService.saveWorkflow>[2] }) =>
      fundsService.saveWorkflow(organizationId!, wf, steps),
    onSettled: () => qc.invalidateQueries({ queryKey: ['funds', 'workflows', organizationId] }),
  })
}

export function useDeleteWorkflow(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (wf: { id: string; name: string }) => fundsService.deleteWorkflow(organizationId!, wf),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['funds', 'workflows', organizationId] }),
  })
}

export function useDelegations(organizationId: string | null) {
  return useQuery({
    queryKey: ['funds', 'delegations', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => fundsService.listDelegations(organizationId!),
  })
}

export function useCreateDelegation(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (d: { delegator: string; delegate: string; startsOn: string; endsOn: string; reason?: string }) => fundsService.createDelegation(organizationId!, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funds', 'delegations', organizationId] })
      qc.invalidateQueries({ queryKey: ['funds', 'my-approvals', organizationId] })
    },
  })
}

export function useEndDelegation(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fundsService.endDelegation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['funds', 'delegations', organizationId] })
      qc.invalidateQueries({ queryKey: ['funds', 'my-approvals', organizationId] })
    },
  })
}
