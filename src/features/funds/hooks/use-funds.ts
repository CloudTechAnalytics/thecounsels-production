import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { fundsService, type DisbursementInput, type FundRequestInput } from '@/features/funds/services/funds.service'
import { useInvalidateStorageUsage } from '@/shared/hooks/use-storage-quota'
import type { FundRequest, FundSettings, FundAttachment } from '@/features/funds/types'
import { useApprovalRights } from '@/features/hr/hooks/use-approval-rules'

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
    mutationFn: (patch: Pick<FundSettings, 'require_line_manager' | 'leadership_threshold' | 'retirement_due_days' | 'retirement_due_basis' | 'escalate_after_hours'>) =>
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
  // Returned so mutateAsync waits for fresh data before callers navigate on.
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ['funds', 'requests', organizationId] }),
    qc.invalidateQueries({ queryKey: ['funds', 'my-approvals', organizationId] }),
    qc.invalidateQueries({ queryKey: ['funds', 'history'] }),
  ])
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

export function useRecallFundRequest(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (id: string) => fundsService.recall(id), onSuccess: invalidate })
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
    mutationFn: (p: { requestId: string; description: string; amount: number; spentOn?: string; category?: string; vendor?: string; notes?: string; receipt?: File | null }) =>
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

export function useDeclareRefund(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: ({ id, ...r }: { id: string; amount: number; returnedOn?: string; method?: string; reference?: string; notes?: string; evidence?: File | null }) =>
      fundsService.declareRefund(organizationId!, id, r),
    onSuccess: () => { invalidate(); invalidateStorage() },
  })
}

export function useVerifyRefund(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ refundId, confirm, reason, allowExcess }: { refundId: string; confirm: boolean; reason?: string; allowExcess?: boolean }) =>
      fundsService.verifyRefund(refundId, confirm, reason, allowExcess),
    onSuccess: invalidate,
  })
}

export function useRecordReimbursement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, ...r }: { id: string; amount: number; paidOn?: string; method?: string; reference?: string; notes?: string }) =>
      fundsService.recordReimbursement(id, r),
    onSuccess: invalidate,
  })
}

export function useReviewItems(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, decisions }: { id: string; decisions: { id: string; decision: 'accept' | 'reject' | 'return'; comment?: string }[] }) =>
      fundsService.reviewItems(id, decisions),
    onSuccess: invalidate,
  })
}

export function useCloseRetirement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: ({ id, note }: { id: string; note?: string }) => fundsService.closeRetirement(id, note), onSuccess: invalidate })
}

export function useSetRetirementDueDate(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: ({ id, due }: { id: string; due: string }) => fundsService.setDueDate(id, due), onSuccess: invalidate })
}

export function useFundRequestHistory(requestId: string | null) {
  return useQuery({
    queryKey: ['funds', 'history', requestId],
    enabled: Boolean(requestId),
    queryFn: () => fundsService.history(requestId!),
  })
}

export function useClaimReimbursement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  const invalidateStorage = useInvalidateStorageUsage(organizationId)
  return useMutation({
    mutationFn: ({ id, ...c }: { id: string; amount: number; reason?: string; evidence?: File | null }) => fundsService.claimReimbursement(organizationId!, id, c),
    onSuccess: () => { invalidate(); invalidateStorage() },
  })
}

export function useWaiveReimbursement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => fundsService.waiveReimbursement(id, note),
    onSuccess: invalidate,
  })
}

export function useDecideReimbursement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ claimId, approve, amount, reason }: { claimId: string; approve: boolean; amount?: number; reason?: string }) =>
      fundsService.decideReimbursement(claimId, approve, amount, reason),
    onSuccess: invalidate,
  })
}

export function usePayReimbursement(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({
    mutationFn: ({ claimId, ...p }: { claimId: string; paidOn?: string; method?: string; reference?: string; notes?: string }) =>
      fundsService.payReimbursement(claimId, p),
    onSuccess: invalidate,
  })
}

export function useWithdrawRetirementItem(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (itemId: string) => fundsService.withdrawItem(itemId), onSuccess: invalidate })
}

export function useWithdrawRefund(organizationId: string | null) {
  const invalidate = useInvalidateFunds(organizationId)
  return useMutation({ mutationFn: (refundId: string) => fundsService.withdrawRefund(refundId), onSuccess: invalidate })
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
  const { activeOrgId, userId } = useAuth()
  const { data } = useQuery({
    queryKey: ['funds', 'my-approvals', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: () => fundsService.myApprovalIds(activeOrgId!),
  })
  const { data: claims } = useQuery({
    queryKey: ['funds', 'my-approvals', activeOrgId, 'reimbursements'],
    enabled: Boolean(activeOrgId),
    queryFn: () => fundsService.myReimbursementApprovalIds(activeOrgId!),
  })
  const ids = React.useMemo(() => new Set(data ?? []), [data])
  const claimIds = React.useMemo(() => new Set(claims ?? []), [claims])
  const canActOn = React.useCallback((r: Pick<FundRequest, 'id' | 'status'>) => r.status === 'pending' && ids.has(r.id), [ids])
  /** A reimbursement claim on this request is waiting for this user's decision. */
  const canApproveClaim = React.useCallback((r: Pick<FundRequest, 'id'>) => claimIds.has(r.id), [claimIds])
  /** Pays out, verifies and closes this request — the firm's chosen finance approvers for its branch (0189). */
  const { can } = useApprovalRights()
  const canFinance = React.useCallback((r: Pick<FundRequest, 'branch_id' | 'user_id'>) => r.user_id !== userId && can('fund_finance', r.branch_id ?? null), [can, userId])
  return { canActOn, canApproveClaim, canFinance }
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
