import * as React from 'react'
import { format } from 'date-fns'
import { CalendarClock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useMyLeaveRequests, useMyLeaveBalances, useCancelLeaveRequest,
  useAllLeaveRequests, useReviewLeaveRequest, useLeaveTypes,
} from '@/features/hr/hooks/use-hr'
import { LEAVE_STATUS_META } from '@/features/hr/types'
import { LeaveRequestDialog } from '@/features/hr/components/leave-request-dialog'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

function MyLeaveTab() {
  const { activeOrgId, userId } = useAuth()
  const { data: requests, isLoading } = useMyLeaveRequests(activeOrgId, userId)
  const { data: balances } = useMyLeaveBalances(activeOrgId, userId)
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const cancel = useCancelLeaveRequest(activeOrgId)
  const typeName = (id: string) => leaveTypes?.find((t) => t.id === id)?.name ?? 'Leave'

  return (
    <div className="space-y-6">
      {balances && balances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {balances.map((b) => (
            <Card key={b.id} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{typeName(b.leave_type_id)}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-xl font-semibold">{b.entitlement_days - b.used_days}</span>
                <span className="text-xs text-muted-foreground">days remaining of {b.entitlement_days}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-base font-semibold">My leave requests</p>
          <LeaveRequestDialog />
        </div>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : requests && requests.length > 0 ? (
          <ul className="divide-y divide-border">
            {requests.map((r) => {
              const meta = LEAVE_STATUS_META[r.status]
              return (
                <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{typeName(r.leave_type_id)} · {r.days} day{r.days === 1 ? '' : 's'}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.start_date), 'MMM d')} – {format(new Date(r.end_date), 'MMM d, yyyy')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {r.status === 'pending' && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={async () => {
                          try { await cancel.mutateAsync(r.id); toast.success('Request cancelled') }
                          catch (err) { toast.error('Could not cancel', { description: errorMessage(err) }) }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No leave requests yet.</p>
        )}
      </Card>
    </div>
  )
}

function TeamLeaveTab() {
  const { activeOrgId } = useAuth()
  const { data: requests, isLoading } = useAllLeaveRequests(activeOrgId)
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const review = useReviewLeaveRequest(activeOrgId)
  const typeName = (id: string) => leaveTypes?.find((t) => t.id === id)?.name ?? 'Leave'

  const act = async (id: string, approve: boolean) => {
    try {
      await review.mutateAsync({ id, approve })
      toast.success(approve ? 'Leave approved' : 'Leave rejected')
    } catch (err) {
      toast.error('Action failed', { description: errorMessage(err) })
    }
  }

  return (
    <Card className="overflow-hidden">
      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : requests && requests.length > 0 ? (
        <ul className="divide-y divide-border">
          {requests.map((r) => {
            const meta = LEAVE_STATUS_META[r.status]
            return (
              <li key={r.id} className={cn('flex items-center justify-between gap-3 p-4', r.status === 'pending' && 'bg-primary/5')}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.requester_name ?? 'Someone'} — {typeName(r.leave_type_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(r.start_date), 'MMM d')} – {format(new Date(r.end_date), 'MMM d, yyyy')} · {r.days} day{r.days === 1 ? '' : 's'}
                    {r.reason ? ` · "${r.reason}"` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.status === 'pending' ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => act(r.id, false)}>Reject</Button>
                      <Button size="sm" onClick={() => act(r.id, true)}>Approve</Button>
                    </>
                  ) : (
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">No leave requests from the team yet.</p>
      )}
    </Card>
  )
}

export function LeavePage() {
  const { has } = usePermissions()
  const canManage = has('leave.manage')
  const [tab, setTab] = React.useState<'mine' | 'team'>('mine')

  return (
    <div>
      <PageHeader title="Leave" description="Request time off and track approvals." />
      {canManage && (
        <div className="mb-4 flex rounded-lg border border-border p-0.5 w-fit">
          {(['mine', 'team'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'mine' ? 'My Leave' : 'Team Leave'}
            </button>
          ))}
        </div>
      )}
      {tab === 'mine' || !canManage ? <MyLeaveTab /> : <TeamLeaveTab />}
      {!canManage && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" /> Only HR and leadership can review the team's leave requests.
        </p>
      )}
    </div>
  )
}
