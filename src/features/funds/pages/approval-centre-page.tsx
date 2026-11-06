import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Wallet, Banknote, ReceiptText, CalendarClock, Inbox, HandCoins } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useApprovalRights } from '@/features/hr/hooks/use-approval-rules'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundRequests, useFundApprovalRights, useDecideFundRequest } from '@/features/funds/hooks/use-funds'
import { fundRequestPath } from '@/features/funds/lib/next-step'
import type { FundRequest } from '@/features/funds/types'
import { formatNaira } from '@/shared/lib/format'
import { useAllLeaveRequests, useAllHrRequests, useLeaveTypes, useReviewLeaveRequest } from '@/features/hr/hooks/use-hr'
import { DelegationsCard } from '@/features/funds/components/fund-settings'
import { RequestList } from '@/features/funds/components/request-list'
import { HR_REQUEST_TYPES, HR_REQUEST_STATUS_META } from '@/features/hr/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { useMyReports } from '@/features/hr/hooks/use-my-reports'

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="font-display text-sm font-semibold">{title}</p>
        <span className={cn('rounded-full px-2 text-xs', count > 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{count}</span>
      </div>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  )
}

/** Fund approvals with tick boxes — approve several in one go (busy partners). */
function BulkFundApprove({ requests, loading }: { requests: FundRequest[]; loading: boolean }) {
  const { activeOrgId } = useAuth()
  const decide = useDecideFundRequest(activeOrgId)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setSelected((s) => new Set([...s].filter((id) => requests.some((r) => r.id === id)))), [requests])
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const approveSelected = async () => {
    setBusy(true)
    let ok = 0
    const failed: string[] = []
    for (const id of selected) {
      try { await decide.mutateAsync({ id, decision: 'approve' }); ok++ }
      catch (err) { failed.push(`${requests.find((r) => r.id === id)?.request_number ?? 'A request'}: ${errorMessage(err)}`) }
    }
    setBusy(false)
    setSelected(new Set())
    if (ok) toast.success(`${ok} request${ok === 1 ? '' : 's'} approved`, { description: 'Each moves to its next step.' })
    if (failed.length) toast.error(`${failed.length} could not be approved`, { description: failed.join(' · ') })
  }
  if (loading) return <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
  if (requests.length === 0) return <p className="p-6 text-center text-sm text-muted-foreground">Nothing waiting for your approval.</p>
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.size === requests.length}
            onChange={(e) => setSelected(e.target.checked ? new Set(requests.map((r) => r.id)) : new Set())} />
          Select all
        </label>
        <Button size="sm" disabled={selected.size === 0} loading={busy} onClick={approveSelected}>Approve selected ({selected.size})</Button>
      </div>
      <ul className="divide-y divide-border">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.title}`} />
            <Link to={fundRequestPath(r.id)} className="min-w-0 flex-1 hover:underline">
              <span className="block truncate text-sm font-medium">{r.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {[r.request_number, r.requester_name, r.chain.find((a) => a.status === 'pending')?.step_name].filter(Boolean).join(' · ')}
              </span>
            </Link>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatNaira(Number(r.approved_amount ?? r.amount))}</span>
          </li>
        ))}
      </ul>
      <p className="px-4 py-2 text-xs text-muted-foreground">To approve a lower amount, reject or return one, open it.</p>
    </div>
  )
}

function LeaveQueue() {
  const { activeOrgId, userId } = useAuth()
  const { data = [], isLoading } = useAllLeaveRequests(activeOrgId)
  const { data: types } = useLeaveTypes(activeOrgId)
  const review = useReviewLeaveRequest(activeOrgId)
  const { can } = useApprovalRights()
  const { reportUserIds } = useMyReports()
  const pending = data.filter((r) => r.status === 'pending' && r.user_id !== userId && (can('leave') || reportUserIds.has(r.user_id)))
  const act = async (id: string, approve: boolean) => {
    try { await review.mutateAsync({ id, approve }); toast.success(approve ? 'Leave approved' : 'Leave rejected') }
    catch (err) { toast.error('Action failed', { description: errorMessage(err) }) }
  }
  return (
    <Section title="Leave to approve" count={pending.length} icon={CalendarClock}>
      {isLoading ? <Skeleton className="m-4 h-12" /> : pending.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-border">
          {pending.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.requester_name ?? 'Someone'} — {types?.find((t) => t.id === r.leave_type_id)?.name ?? 'Leave'}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(r.start_date), 'MMM d')} – {format(new Date(r.end_date), 'MMM d, yyyy')} · {r.days} day{Number(r.days) === 1 ? '' : 's'}{r.reason ? ` · "${r.reason}"` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => act(r.id, false)} disabled={review.isPending}>Reject</Button>
                <Button size="sm" onClick={() => act(r.id, true)} disabled={review.isPending}>Approve</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function HrRequestQueue() {
  const { activeOrgId, userId } = useAuth()
  const { data = [], isLoading } = useAllHrRequests(activeOrgId)
  const open = data.filter((r) => (r.status === 'submitted' || r.status === 'in_review') && r.user_id !== userId)
  return (
    <Section title="HR requests to handle" count={open.length} icon={Inbox}>
      {isLoading ? <Skeleton className="m-4 h-12" /> : open.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing waiting.</p>
      ) : (
        <ul className="divide-y divide-border">
          {open.map((r) => (
            <li key={r.id}>
              <Link to="/hr/requests" className="flex items-center justify-between gap-3 p-4 hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.requester_name ?? 'Someone'} — {r.subject}</p>
                  <p className="text-xs text-muted-foreground">{HR_REQUEST_TYPES.find((t) => t.value === r.request_type)?.label ?? 'Request'} · {format(new Date(r.created_at), 'MMM d, yyyy')}</p>
                </div>
                <Badge variant={HR_REQUEST_STATUS_META[r.status]?.variant}>{HR_REQUEST_STATUS_META[r.status]?.label ?? r.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Everything awaiting the signed-in user, across fund requests, payouts,
 * retirements, leave and HR requests — one place to clear the queue. */
export function ApprovalCentrePage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: requests = [], isLoading } = useFundRequests(activeOrgId)
  const { canActOn, canApproveClaim, canFinance } = useFundApprovalRights()
  const { can } = useApprovalRights()
  const { isLineManager } = useMyReports()
  const canManageFunds = has('funds.manage')

  const toApprove = requests.filter(canActOn)
  const toPay = canManageFunds ? requests.filter((r) => (r.status === 'approved' || r.status === 'payment_processing') && canFinance(r)) : []
  const toReview = canManageFunds ? requests.filter((r) => r.status === 'retirement_submitted' && canFinance(r)) : []
  const claimsToApprove = requests.filter(canApproveClaim)
  const claimsToPay = canManageFunds ? requests.filter((r) => Number(r.reimbursement_due) > 0 && canFinance(r)) : []


  return (
    <div>
      <PageHeader title="Approval Centre" description="Everything waiting for your decision, in one place." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Fund requests to approve" count={toApprove.length} icon={Wallet}>
          <BulkFundApprove requests={toApprove} loading={isLoading} />
        </Section>
        {canManageFunds && (
          <Section title="Approved — ready to pay out" count={toPay.length} icon={Banknote}>
            <RequestList requests={toPay} loading={isLoading} empty="Nothing to pay out." showRequester />
          </Section>
        )}
        {canManageFunds && (
          <Section title="Expenses and refunds to verify" count={toReview.length} icon={ReceiptText}>
            <RequestList requests={toReview} loading={isLoading} empty="No retirements waiting." showRequester />
          </Section>
        )}
        {(claimsToApprove.length > 0 || has('funds.approve')) && (
          <Section title="Reimbursement claims to approve" count={claimsToApprove.length} icon={HandCoins}>
            <RequestList requests={claimsToApprove} loading={isLoading} empty="No reimbursement claims waiting." showRequester />
          </Section>
        )}
        {canManageFunds && (
          <Section title="Reimbursements to pay" count={claimsToPay.length} icon={HandCoins}>
            <RequestList requests={claimsToPay} loading={isLoading} empty="No approved reimbursements to pay." showRequester />
          </Section>
        )}
        {((has('leave.manage') && can('leave')) || isLineManager) && <LeaveQueue />}
        {has('hr_requests.manage') && can('hr_request') && <HrRequestQueue />}
      </div>
      <div className="mt-8">
        <DelegationsCard />
      </div>
    </div>
  )
}
