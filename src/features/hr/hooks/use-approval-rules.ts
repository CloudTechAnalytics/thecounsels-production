import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database.types'
import type { PlanFeatureKey } from '@/features/administration/lib/plan-features'

export type ApprovalRule = Database['public']['Tables']['approval_rules']['Row']
export type ApprovalArea = 'leave' | 'hr_request' | 'payroll' | 'salary' | 'fund_finance' | 'reimbursement' | 'inventory'
export interface ApprovalCandidate { area: string; kind: string; value: string; label: string; detail: string | null }

/** The areas a firm can assign approvers for, with the permission that
 * qualifies someone (approval_area_permission in 0189). */
export const APPROVAL_AREAS: { area: ApprovalArea; label: string; description: string; permission: string; feature?: PlanFeatureKey }[] = [
  { area: 'fund_finance', label: 'Fund payouts & verification', description: 'Pays out approved advances, verifies receipts and refunds, pays reimbursements and closes advances.', permission: 'funds.manage', feature: 'fund_requests' },
  { area: 'reimbursement', label: 'Reimbursement claims', description: 'Approves claims when staff spent more than their advance.', permission: 'funds.approve', feature: 'fund_requests' },
  { area: 'leave', label: 'Leave', description: 'Approves or rejects leave applications.', permission: 'leave.manage' },
  { area: 'hr_request', label: 'HR requests', description: 'Handles letters, records updates and other HR requests.', permission: 'hr_requests.manage' },
  { area: 'payroll', label: 'Payroll approval', description: 'Approves the monthly payroll another payroll manager prepared.', permission: 'payroll.manage', feature: 'payroll' },
  { area: 'salary', label: 'Salary changes', description: 'Sets and changes staff salaries and bank details.', permission: 'payroll.manage', feature: 'payroll' },
  { area: 'inventory', label: 'Inventory requests', description: 'Approves staff requests for office items (their line manager can too).', permission: 'inventory.manage', feature: 'inventory' },
]

const keys = {
  rules: (org: string | null) => ['approval-rules', org] as const,
  candidates: (org: string | null) => ['approval-rules', org, 'candidates'] as const,
  rights: (org: string | null) => ['approval-rules', org, 'my-rights'] as const,
}

export function useApprovalRules(organizationId: string | null) {
  return useQuery({
    queryKey: keys.rules(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('approval_rules').select('*').eq('organization_id', organizationId!)
      if (error) throw error
      return (data ?? []) as ApprovalRule[]
    },
  })
}

export function useApprovalCandidates(organizationId: string | null) {
  return useQuery({
    queryKey: keys.candidates(organizationId),
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('approval_candidates', { p_org: organizationId! })
      if (error) throw error
      return (data ?? []) as ApprovalCandidate[]
    },
  })
}

export function useSaveApprovalRule(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id?: string; area: ApprovalArea; branchId: string | null; roles: string[]; userIds: string[] }) => {
      const row = { area: v.area, branch_id: v.branchId, approver_roles: v.roles, approver_user_ids: v.userIds }
      const { error } = v.id
        ? await supabase.from('approval_rules').update(row).eq('id', v.id)
        : await supabase.from('approval_rules').insert({ ...row, organization_id: organizationId! })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-rules', organizationId] }),
  })
}

export function useResetApprovalRule(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('approval_rules').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-rules', organizationId] }),
  })
}

/** What the signed-in user may approve under the firm's rules, so screens
 * only show buttons that will work. Until it loads, falls back to the
 * plain permission check — the server enforces the real rule either way. */
export function useApprovalRights() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data } = useQuery({
    queryKey: keys.rights(activeOrgId),
    enabled: Boolean(activeOrgId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_approval_rights', { p_org: activeOrgId! })
      if (error) throw error
      return data ?? []
    },
  })
  const can = React.useCallback(
    (area: ApprovalArea, branchId?: string | null) => {
      if (!data) return has(APPROVAL_AREAS.find((a) => a.area === area)!.permission as Parameters<typeof has>[0])
      const rows = data.filter((r) => r.area === area)
      if (branchId === undefined) return rows.some((r) => r.allowed)
      return (rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null))?.allowed ?? false
    },
    [data, has],
  )
  return { can }
}
