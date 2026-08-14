import * as React from 'react'
import { format } from 'date-fns'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMyHrRequests, useAllHrRequests, useUpdateHrRequestStatus } from '@/features/hr/hooks/use-hr'
import { HR_REQUEST_STATUS_META, HR_REQUEST_TYPES } from '@/features/hr/types'
import { HrRequestDialog } from '@/features/hr/components/hr-request-dialog'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const typeLabel = (v: string) => HR_REQUEST_TYPES.find((t) => t.value === v)?.label ?? v

function MyRequestsTab() {
  const { activeOrgId, userId } = useAuth()
  const { data: requests, isLoading } = useMyHrRequests(activeOrgId, userId)

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-display text-base font-semibold">My requests</p>
        <HrRequestDialog />
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : requests && requests.length > 0 ? (
        <ul className="divide-y divide-border">
          {requests.map((r) => {
            const meta = HR_REQUEST_STATUS_META[r.status]
            return (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.subject}</p>
                  <p className="text-xs text-muted-foreground">{typeLabel(r.request_type)} · {format(new Date(r.created_at), 'MMM d, yyyy')}</p>
                </div>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">No requests submitted yet.</p>
      )}
    </Card>
  )
}

const NEXT_STATUS: Record<string, { label: string; status: string }[]> = {
  submitted: [{ label: 'Start review', status: 'in_review' }, { label: 'Reject', status: 'rejected' }],
  in_review: [{ label: 'Start progress', status: 'in_progress' }, { label: 'Approve', status: 'approved' }, { label: 'Reject', status: 'rejected' }],
  in_progress: [{ label: 'Complete', status: 'completed' }],
  approved: [{ label: 'Complete', status: 'completed' }],
}

function ManageRequestsTab() {
  const { activeOrgId } = useAuth()
  const { data: requests, isLoading } = useAllHrRequests(activeOrgId)
  const updateStatus = useUpdateHrRequestStatus(activeOrgId)

  const act = async (id: string, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status })
      toast.success('Request updated')
    } catch (err) {
      toast.error('Could not update', { description: errorMessage(err) })
    }
  }

  return (
    <Card className="overflow-hidden">
      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : requests && requests.length > 0 ? (
        <ul className="divide-y divide-border">
          {requests.map((r) => {
            const meta = HR_REQUEST_STATUS_META[r.status]
            const actions = NEXT_STATUS[r.status] ?? []
            return (
              <li key={r.id} className={cn('flex items-center justify-between gap-3 p-4', r.status === 'submitted' && 'bg-primary/5')}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.requester_name ?? 'Someone'} — {r.subject}</p>
                  <p className="text-xs text-muted-foreground">{typeLabel(r.request_type)} · {format(new Date(r.created_at), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  {actions.map((a) => (
                    <Button key={a.status} size="sm" variant={a.status === 'rejected' ? 'outline' : 'default'} onClick={() => act(r.id, a.status)}>
                      {a.label}
                    </Button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">No HR requests yet.</p>
      )}
    </Card>
  )
}

export function HrRequestsPage() {
  const { has } = usePermissions()
  const canManage = has('hr_requests.manage')
  const [tab, setTab] = React.useState<'mine' | 'manage'>('mine')

  return (
    <div>
      <PageHeader title="HR Requests" description="Employment letters, certificates, equipment and workplace issues." />
      {canManage && (
        <div className="mb-4 flex w-fit rounded-lg border border-border p-0.5">
          {(['mine', 'manage'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'mine' ? 'My Requests' : 'Manage'}
            </button>
          ))}
        </div>
      )}
      {tab === 'mine' || !canManage ? <MyRequestsTab /> : <ManageRequestsTab />}
    </div>
  )
}
