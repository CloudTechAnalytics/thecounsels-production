import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Database } from '@/shared/types/database.types'

export type FundSettings = Database['public']['Tables']['fund_settings']['Row']
export type FundRequestRow = Database['public']['Tables']['fund_requests']['Row']
export type FundApprovalRow = Database['public']['Tables']['fund_request_approvals']['Row']
export type FundRetirementItem = Database['public']['Tables']['fund_retirement_items']['Row']

export type FundAttachment = Database['public']['Tables']['fund_request_attachments']['Row']
export type ApprovalWorkflow = Database['public']['Tables']['approval_workflows']['Row']
export type ApprovalWorkflowStep = Database['public']['Tables']['approval_workflow_steps']['Row']
export type ApprovalDelegation = Database['public']['Tables']['approval_delegations']['Row']
export type WorkflowWithSteps = ApprovalWorkflow & { steps: ApprovalWorkflowStep[] }

export type FundApproval = FundApprovalRow & { approver_name: string | null; actor_name: string | null }

/** A request with everything the list and detail views need in one fetch. */
export type FundRequest = FundRequestRow & {
  requester_name: string | null
  matter_label: string | null
  client_label: string | null
  disbursed_by_name: string | null
  /** Every approval row across every round; `chain` is just the current round. */
  approvals: FundApproval[]
  chain: FundApproval[]
  items: FundRetirementItem[]
  attachments: FundAttachment[]
}

export const FUND_CATEGORIES = [
  { value: 'court_appearance', label: 'Court appearance' },
  { value: 'transport', label: 'Transportation' },
  { value: 'accommodation', label: 'Accommodation' },
  { value: 'court_filing', label: 'Filing fees' },
  { value: 'client_expense', label: 'Client-related expenses' },
  { value: 'office_supplies', label: 'Office expenses' },
  { value: 'travel', label: 'Travel expenses' },
  { value: 'other', label: 'Other expenses' },
]
// Categories from before the list was aligned with the spec — still shown correctly on old requests.
const LEGACY_CATEGORY_LABELS: Record<string, string> = { utilities: 'Utilities & bills', training: 'Training', staff_welfare: 'Staff welfare' }

export const fundCategoryLabel = (value: string) =>
  FUND_CATEGORIES.find((c) => c.value === value)?.label ?? LEGACY_CATEGORY_LABELS[value] ?? value

export const FUND_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  draft: { label: 'Draft', variant: 'muted' },
  pending: { label: 'Pending approval', variant: 'warning' },
  returned: { label: 'Returned for clarification', variant: 'warning' },
  approved: { label: 'Approved · to pay out', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Withdrawn', variant: 'muted' },
  payment_processing: { label: 'Payment processing', variant: 'default' },
  disbursed: { label: 'Disbursed · retirement pending', variant: 'warning' },
  retirement_submitted: { label: 'Retirement in review', variant: 'default' },
  retired: { label: 'Retired', variant: 'success' },
}

/** Status label, calling out a partial approval (approver lowered the amount). */
export function fundStatusLabel(r: Pick<FundRequestRow, 'status' | 'amount' | 'approved_amount'>): string {
  const partial = r.approved_amount != null && Number(r.approved_amount) < Number(r.amount)
  if (partial && r.status === 'approved') return 'Partially approved · to pay out'
  return FUND_STATUS_META[r.status]?.label ?? r.status
}

/** Roles that hold funds.approve (migrations 0174 + 0177). Only these
 * can approve fund requests, appear as named approvers, or take a
 * delegation — the database enforces the same list. */
export const APPROVER_ROLE_KEYS = ['managing_partner', 'partner', 'finance', 'hr_manager', 'hr_administrator', 'hr'] as const
export const isApproverRole = (key: string | null | undefined) => Boolean(key && (APPROVER_ROLE_KEYS as readonly string[]).includes(key))

export const APPROVER_TYPES = [
  { value: 'line_manager', label: "Requester's line manager (if an approver)" },
  { value: 'department_head', label: "Requester's department head (if an approver)" },
  { value: 'role', label: 'Anyone with an approver role' },
  { value: 'permission', label: 'Any approver' },
  { value: 'specific_user', label: 'A specific person' },
]

export const DISBURSEMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
]

export const DEFAULT_FUND_SETTINGS: Omit<FundSettings, 'organization_id' | 'updated_by' | 'updated_at'> = {
  require_line_manager: true,
  leadership_threshold: null,
  retirement_due_days: 14,
}

/** Money still with the staff member (positive) or owed back to them (negative). */
export function retirementBalance(r: Pick<FundRequestRow, 'disbursed_amount'>, items: Pick<FundRetirementItem, 'amount'>[]): number {
  const spent = items.reduce((s, i) => s + Number(i.amount), 0)
  return Math.round((Number(r.disbursed_amount ?? 0) - spent) * 100) / 100
}

/** Days since payout for a request whose retirement is still outstanding. */
export function daysOutstanding(r: Pick<FundRequestRow, 'disbursed_at'>): number | null {
  if (!r.disbursed_at) return null
  return Math.floor((Date.now() - new Date(r.disbursed_at).getTime()) / 86_400_000)
}
