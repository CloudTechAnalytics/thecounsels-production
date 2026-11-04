import { formatNaira } from '@/shared/lib/format'
import { outstandingBalance, isRetirementOverdue, type FundRequest } from '@/features/funds/types'

/** The single action a viewer can take on a request right now. */
export type FundAction = 'edit' | 'approve' | 'pay' | 'retire' | 'verify' | 'close' | 'claim' | 'approve_claim' | 'pay_claim' | null

export interface NextStep {
  /** One plain sentence: what happens next, and who it's waiting on. */
  text: string
  action: FundAction
  /** Button label for `action`. */
  actionLabel?: string
  tone: 'you' | 'waiting' | 'done' | 'stopped' | 'late'
}

export interface ViewerContext {
  userId: string | null
  canActOn: (r: FundRequest) => boolean
  canManage: boolean
  /** A reimbursement claim on this request awaits the viewer's decision. */
  canApproveClaim?: (r: FundRequest) => boolean
}

/** Who the open approval step is waiting on, in words. */
export function waitingOn(r: FundRequest): string {
  const open = r.chain.filter((a) => a.status === 'pending')
  if (open.length === 0) return 'an approver'
  return open.map((a) => (a.approver_name ? `${a.approver_name} (${a.step_name ?? 'approver'})` : (a.step_name ?? 'an approver'))).join(' and ')
}

export function nextStep(r: FundRequest, ctx: ViewerContext): NextStep {
  const mine = r.user_id === ctx.userId
  const who = mine ? 'you' : (r.requester_name ?? 'the employee')
  const money = formatNaira(Number(r.approved_amount ?? r.amount))
  const owed = outstandingBalance(r)

  switch (r.status) {
    case 'draft':
      return mine
        ? { text: 'Not sent yet — finish it and submit it for approval.', action: 'edit', actionLabel: 'Edit & submit', tone: 'you' }
        : { text: 'Draft — not sent yet.', action: null, tone: 'waiting' }
    case 'pending':
      if (ctx.canActOn(r)) return { text: 'Your approval is needed.', action: 'approve', actionLabel: 'Review & approve', tone: 'you' }
      return { text: `Waiting for ${waitingOn(r)} to approve.`, action: null, tone: 'waiting' }
    case 'returned':
      return mine
        ? { text: 'An approver asked for changes — update it and resubmit.', action: 'edit', actionLabel: 'Update & resubmit', tone: 'you' }
        : { text: `Sent back to ${who} for clarification.`, action: null, tone: 'waiting' }
    case 'approved':
    case 'payment_processing':
      if (ctx.canManage && !mine) return { text: `Approved — pay out ${money}.`, action: 'pay', actionLabel: 'Pay out', tone: 'you' }
      return { text: mine ? `Approved — waiting for finance to pay you ${money}.` : `Approved — waiting for finance to pay out ${money}.`, action: null, tone: 'waiting' }
    case 'disbursed':
    case 'partially_retired': {
      const late = isRetirementOverdue(r) && owed > 0
      if (Number(r.reimbursement_claimed) > 0) {
        if (ctx.canApproveClaim?.(r)) return { text: `${who} claimed ${formatNaira(Number(r.reimbursement_claimed))} for spending above the advance — approve or decline.`, action: 'approve_claim', actionLabel: 'Review claim', tone: 'you' }
        return { text: mine ? `Your reimbursement claim of ${formatNaira(Number(r.reimbursement_claimed))} is waiting for approval.` : `Reimbursement claim of ${formatNaira(Number(r.reimbursement_claimed))} is waiting for approval.`, action: null, tone: 'waiting' }
      }
      if (Number(r.reimbursement_due) > 0) {
        if (ctx.canManage && !mine) return { text: `Reimbursement of ${formatNaira(Number(r.reimbursement_due))} approved — pay ${who}.`, action: 'pay_claim', actionLabel: 'Pay reimbursement', tone: 'you' }
        return { text: mine ? `Your reimbursement of ${formatNaira(Number(r.reimbursement_due))} is approved — finance will pay you.` : `Reimbursement of ${formatNaira(Number(r.reimbursement_due))} approved — waiting for finance to pay.`, action: null, tone: 'waiting' }
      }
      if (owed < 0) {
        return mine
          ? { text: `You spent ${formatNaira(-owed)} more than you were given — claim it back.`, action: 'claim', actionLabel: 'Claim reimbursement', tone: 'you' }
          : { text: `${who} spent ${formatNaira(-owed)} above the advance — waiting for them to claim it.`, action: null, tone: 'waiting' }
      }
      if (mine) {
        return { text: `You have ${formatNaira(owed)} to account for — add receipts and/or return unused money${late ? '. Overdue.' : '.'}`, action: 'retire', actionLabel: 'Add receipts / refund', tone: late ? 'late' : 'you' }
      }
      return { text: `Waiting for ${who} to account for ${formatNaira(owed)}${late ? ' — overdue' : ''}.`, action: null, tone: late ? 'late' : 'waiting' }
    }
    case 'retirement_submitted':
      if (ctx.canManage && !mine) return { text: 'Receipts or a refund are waiting for your verification.', action: 'verify', actionLabel: 'Verify', tone: 'you' }
      return { text: mine ? 'Finance is checking your receipts / refund (someone other than you must verify them).' : 'Waiting for finance to verify receipts / refund.', action: null, tone: 'waiting' }
    case 'retired':
      if (ctx.canManage && !mine) return { text: 'Fully accounted for — close it to finish.', action: 'close', actionLabel: 'Close', tone: 'you' }
      return { text: 'Fully accounted for. Finance will close it.', action: null, tone: 'done' }
    case 'closed':
      return { text: 'Closed — fully reconciled.', action: null, tone: 'done' }
    case 'rejected':
      return { text: 'Rejected.', action: null, tone: 'stopped' }
    case 'cancelled':
      return { text: 'Withdrawn.', action: null, tone: 'stopped' }
    default:
      return { text: r.status, action: null, tone: 'waiting' }
  }
}

export const FUND_STAGES = ['Request', 'Approval', 'Payment', 'Retirement', 'Closed'] as const

/** Which stage a request is at (index into FUND_STAGES), and whether it stopped there. */
export function fundStage(r: Pick<FundRequest, 'status'>): { index: number; stopped: boolean } {
  switch (r.status) {
    case 'draft':
    case 'returned':
      return { index: 0, stopped: false }
    case 'pending':
      return { index: 1, stopped: false }
    case 'rejected':
      return { index: 1, stopped: true }
    case 'cancelled':
      return { index: 1, stopped: true }
    case 'approved':
    case 'payment_processing':
      return { index: 2, stopped: false }
    case 'disbursed':
    case 'partially_retired':
    case 'retirement_submitted':
    case 'retired':
      return { index: 3, stopped: false }
    case 'closed':
      return { index: 4, stopped: false }
    default:
      return { index: 0, stopped: false }
  }
}

/** What the requester can still do to their own request, besides the next step. */
export function requesterOptions(r: FundRequest) {
  const decided = r.chain.some((a) => ['approved', 'rejected', 'returned'].includes(a.status))
  return {
    canEdit: r.status === 'draft' || r.status === 'returned' || (r.status === 'pending' && !decided),
    needsRecall: r.status === 'pending' && !decided,
    canDelete: r.status === 'draft' && !r.request_number,
    canWithdraw: ['draft', 'pending', 'returned', 'approved'].includes(r.status) && !(r.status === 'draft' && !r.request_number),
  }
}

export type FundTab = 'overview' | 'expenses' | 'refunds' | 'summary' | 'history'

/** Which tab of the request page an action belongs on. */
export function tabForAction(r: Pick<FundRequest, 'submitted_expenses' | 'pending_refunds' | 'accepted_amount' | 'disbursed_amount' | 'refunded_amount' | 'reimbursed_amount' | 'excess_borne'>, action: FundAction): FundTab {
  switch (action) {
    case 'retire':
      return 'expenses'
    case 'verify':
      if (Number(r.submitted_expenses) > 0) return 'expenses'
      if (Number(r.pending_refunds) > 0 || outstandingBalance(r) < 0) return 'refunds'
      return 'summary'
    case 'close':
      return 'summary'
    case 'claim':
    case 'approve_claim':
    case 'pay_claim':
      return 'refunds'
    default:
      return 'overview'
  }
}

/** Link to a request's page, optionally opened on a tab. */
export const fundRequestPath = (id: string, tab?: FundTab) => `/hr/funds/${id}${tab && tab !== 'overview' ? `?tab=${tab}` : ''}`
