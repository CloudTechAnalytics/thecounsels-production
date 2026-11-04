import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Database } from '@/shared/types/database.types'

export type FundSettings = Database['public']['Tables']['fund_settings']['Row']
export type FundRequestRow = Database['public']['Tables']['fund_requests']['Row']
export type FundApprovalRow = Database['public']['Tables']['fund_request_approvals']['Row']
export type FundRetirementItem = Database['public']['Tables']['fund_retirement_items']['Row']

export type FundApproval = FundApprovalRow & { approver_name: string | null; actor_name: string | null }

/** A request with everything the list and detail views need in one fetch. */
export type FundRequest = FundRequestRow & {
  requester_name: string | null
  matter_label: string | null
  disbursed_by_name: string | null
  approvals: FundApproval[]
  items: FundRetirementItem[]
}

export const FUND_CATEGORIES = [
  { value: 'court_filing', label: 'Court filing & fees' },
  { value: 'travel', label: 'Travel' },
  { value: 'transport', label: 'Local transport' },
  { value: 'client_expense', label: 'Client / matter expense' },
  { value: 'office_supplies', label: 'Office supplies' },
  { value: 'utilities', label: 'Utilities & bills' },
  { value: 'training', label: 'Training' },
  { value: 'staff_welfare', label: 'Staff welfare' },
  { value: 'other', label: 'Other' },
]

export const fundCategoryLabel = (value: string) => FUND_CATEGORIES.find((c) => c.value === value)?.label ?? value

export const FUND_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Awaiting approval', variant: 'warning' },
  approved: { label: 'Approved · to disburse', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  disbursed: { label: 'Paid out · to retire', variant: 'warning' },
  retirement_submitted: { label: 'Retirement in review', variant: 'default' },
  retired: { label: 'Retired', variant: 'success' },
}

export const FUND_STAGE_LABEL: Record<string, string> = {
  line_manager: 'Line manager',
  approver: 'Finance approval',
  leadership: 'Partner approval',
}

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
