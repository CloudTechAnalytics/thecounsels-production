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
import { useApprovalRights } from '@/features/hr/hooks/use-approval-rules'
import { useMyReports } from '@/features/hr/hooks/use-my-reports'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { Input } from '@/shared/components/ui/input'
import { ThumbsDown, ThumbsUp } from 'lucide-react'

const typeLabel = (v: string) => HR_REQUEST_TYPES.find((t) => t.value === v)?.label ?? v
const OPEN = ['submitted', 'in_review', 'in_progress']

function useRecommend() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; support: boolean; note: string }) => {
      const { error } = await supabase.rpc('recommend_hr_request', { p_id: v.id, p_support: v.support, p_note: v.note || null })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr'] }),
  })
}

/** What the line manager said, shown to HR (and back to the manager). */
function Recommendation({ r }: { r: { manager_support: boolean | null; manager_note: string | null; manager_at: string | null } }) {
  if (r.manager_support == null) return null
  return (
    <p className={cn('mt-1 flex items-start gap-1.5 text-xs', r.manager_support ? 'text-success' : 'text-warning')}>
      {r.manager_support ? <ThumbsUp className="mt-0.5 h-3 w-3 shrink-0" /> : <ThumbsDown className="mt-0.5 h-3 w-3 shrink-0" />}
      <span>Line manager {r.manager_support ? 'supports this' : 'does not support this'}{r.manager_note ? ` — “${r.manager_note}”` : ''}</span>
    </p>
  )
}

/** Line managers: their team's requests (never workplace issues), with Support / Don't support. */
function TeamRequestsTab() {
  const { activeOrgId, userId } = useAuth()
  const { data: requests, isLoading } = useAllHrRequests(activeOrgId)
  const { reportUserIds } = useMyReports()
  const recommend = useRecommend()
  const [open, setOpen] = React.useState<{ id: string; support: boolean } | null>(null)
  const [note, setNote] = React.useState('')
  const team = (requests ?? []).filter((r) => r.user_id !== userId && reportUserIds.has(r.user_id) && r.request_type !== 'workplace_issue')

  const send = () => {
    if (!open) return
    if (!open.support && !note.trim()) { toast.error('Say why you don’t support it'); return }
    recommend.mutate({ id: open.id, support: open.support, note }, {
      onSuccess: () => { toast.success('Your recommendation was sent to HR'); setOpen(null); setNote('') },
      onError: (e) => toast.error('Could not save', { description: errorMessage(e) }),
    })
  }

  return (
    <Card className="overflow-hidden">
      <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
        Your team’s requests. Add a recommendation for HR — they make the final decision. Workplace issues stay confidential to HR.
      </p>
      {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : team.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No requests from your team.</p> : (
        <ul className="divide-y divide-border">
          {team.map((r) => {
            const meta = HR_REQUEST_STATUS_META[r.status]
            const canAdd = OPEN.includes(r.status) && r.manager_support == null
            return (
              <li key={r.id} className={cn('space-y-2 p-4', canAdd && 'bg-primary/5')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.requester_name ?? 'Team member'} — {r.subject}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(r.request_type)} · {format(new Date(r.created_at), 'MMM d, yyyy')}</p>
                    {r.details && <p className="mt-1 text-xs text-muted-foreground">{r.details}</p>}
                    <Recommendation r={r} />
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    {canAdd && open?.id !== r.id && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setOpen({ id: r.id, support: false }); setNote('') }}><ThumbsDown className="h-3.5 w-3.5" /> Don’t support</Button>
                        <Button size="sm" onClick={() => { setOpen({ id: r.id, support: true }); setNote('') }}><ThumbsUp className="h-3.5 w-3.5" /> Support</Button>
                      </>
                    )}
                  </div>
                </div>
                {open?.id === r.id && (
                  <div className="flex flex-wrap gap-2">
                    <Input className="max-w-md flex-1" autoFocus value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder={open.support ? 'Note for HR (optional)' : 'Why don’t you support it? (required)'} />
                    <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Cancel</Button>
                    <Button size="sm" onClick={send} loading={recommend.isPending}>{open.support ? 'Send support' : 'Send'}</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

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
  const { activeOrgId, userId } = useAuth()
  const { data: all, isLoading } = useAllHrRequests(activeOrgId)
  const requests = all
  const updateStatus = useUpdateHrRequestStatus(activeOrgId)
  const { can } = useApprovalRights()

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
                  <Recommendation r={r} />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  {r.user_id !== userId && can('hr_request') && actions.map((a) => (
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
  const { isLineManager } = useMyReports()
  const [tab, setTab] = React.useState<'mine' | 'team' | 'manage'>('mine')
  const tabs = (['mine', 'team', 'manage'] as const).filter((t) => t === 'mine' || (t === 'team' && isLineManager) || (t === 'manage' && canManage))

  return (
    <div>
      <PageHeader title="HR Requests" description="Employment letters, certificates, equipment and workplace issues." />
      {tabs.length > 1 && (
        <div className="mb-4 flex w-fit rounded-lg border border-border p-0.5">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'mine' ? 'My Requests' : t === 'team' ? 'My team' : 'Manage'}
            </button>
          ))}
        </div>
      )}
      {tab === 'team' && isLineManager ? <TeamRequestsTab /> : tab === 'manage' && canManage ? <ManageRequestsTab /> : <MyRequestsTab />}
    </div>
  )
}
