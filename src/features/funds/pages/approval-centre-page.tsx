import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Wallet, Banknote, ReceiptText, CalendarClock, Inbox } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundRequests, useFundApprovalRights } from '@/features/funds/hooks/use-funds'
import { useAllLeaveRequests, useAllHrRequests, useLeaveTypes, useReviewLeaveRequest } from '@/features/hr/hooks/use-hr'
import { FundRequestDetailDialog } from '@/features/funds/components/fund-request-detail-dialog'
import { DelegationsCard } from '@/features/funds/components/fund-settings'
import { RequestList } from '@/features/funds/pages/funds-page'
import { HR_REQUEST_TYPES, HR_REQUEST_STATUS_META } from '@/features/hr/types'
import type { FundRequest } from '@/features/funds/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

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

function LeaveQueue() {
  const { activeOrgId, userId } = useAuth()
  const { data = [], isLoading } = useAllLeaveRequests(activeOrgId)
  const { data: types } = useLeaveTypes(activeOrgId)
  const review = useReviewLeaveRequest(activeOrgId)
  const pending = data.filter((r) => r.status === 'pending' && r.user_id !== userId)
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
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data: requests = [], isLoading } = useFundRequests(activeOrgId)
  const { canActOn } = useFundApprovalRights()
  const [params, setParams] = useSearchParams()
  const canManageFunds = has('funds.manage')

  const toApprove = requests.filter(canActOn)
  const toPay = canManageFunds ? requests.filter((r) => (r.status === 'approved' || r.status === 'payment_processing') && r.user_id !== userId) : []
  const toReview = canManageFunds ? requests.filter((r) => r.status === 'retirement_submitted' && r.user_id !== userId) : []

  const openId = params.get('request')
  const open = openId ? requests.find((r) => r.id === openId) ?? null : null
  const setOpen = (r: FundRequest | null) => {
    const next = new URLSearchParams(params)
    if (r) next.set('request', r.id)
    else next.delete('request')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader title="Approval Centre" description="Everything waiting for your decision, in one place." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Fund requests to approve" count={toApprove.length} icon={Wallet}>
          <RequestList requests={toApprove} loading={isLoading} empty="Nothing waiting for your approval." showRequester onOpen={setOpen} />
        </Section>
        {canManageFunds && (
          <Section title="Approved — ready to pay out" count={toPay.length} icon={Banknote}>
            <RequestList requests={toPay} loading={isLoading} empty="Nothing to pay out." showRequester onOpen={setOpen} />
          </Section>
        )}
        {canManageFunds && (
          <Section title="Expenses and refunds to verify" count={toReview.length} icon={ReceiptText}>
            <RequestList requests={toReview} loading={isLoading} empty="No retirements waiting." showRequester onOpen={setOpen} />
          </Section>
        )}
        {has('leave.manage') && <LeaveQueue />}
        {has('hr_requests.manage') && <HrRequestQueue />}
      </div>
      <div className="mt-8">
        <DelegationsCard />
      </div>
      <FundRequestDetailDialog request={open} onOpenChange={(o) => { if (!o) setOpen(null) }} />
    </div>
  )
}
