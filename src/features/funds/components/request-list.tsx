import * as React from 'react'
import { format } from 'date-fns'
import { MoreHorizontal, Eye, Pencil, Undo2, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundApprovalRights, useCancelFundRequest, useDeleteFundDraft, useRecallFundRequest } from '@/features/funds/hooks/use-funds'
import { nextStep, requesterOptions, type FundAction } from '@/features/funds/lib/next-step'
import { FundProgress } from '@/features/funds/components/fund-progress'
import { fundCategoryLabel, type FundRequest } from '@/features/funds/types'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const TONE: Record<string, string> = {
  you: 'text-primary font-medium',
  late: 'text-destructive font-medium',
  waiting: 'text-muted-foreground',
  done: 'text-success',
  stopped: 'text-muted-foreground',
}

/** Which part of the request window an action jumps to. */
export const ACTION_FOCUS: Record<Exclude<FundAction, null | 'edit'>, string> = {
  approve: 'decision',
  pay: 'payout',
  retire: 'retirement',
  verify: 'retirement',
  close: 'retirement',
}

/**
 * Request rows that say, in words, what happens next and who it's waiting
 * on, with that step's button right on the row and a ⋯ menu for view /
 * edit / withdraw / delete — so nobody has to open a request to find out
 * what to do with it.
 */
export function RequestList({ requests, loading, empty, showRequester, onOpen, onEdit }: {
  requests: FundRequest[]
  loading: boolean
  empty: string
  showRequester?: boolean
  onOpen: (r: FundRequest, focus?: string) => void
  onEdit: (r: FundRequest) => void
}) {
  const { userId } = useAuth()
  const { has } = usePermissions()
  const { activeOrgId } = useAuth()
  const { canActOn } = useFundApprovalRights()
  const cancel = useCancelFundRequest(activeOrgId)
  const deleteDraft = useDeleteFundDraft(activeOrgId)
  const recall = useRecallFundRequest(activeOrgId)
  const [confirm, setConfirm] = React.useState<{ kind: 'withdraw' | 'delete'; r: FundRequest } | null>(null)
  const ctx = { userId, canActOn, canManage: has('funds.manage') }

  const edit = async (r: FundRequest) => {
    if (requesterOptions(r).needsRecall) {
      try { await recall.mutateAsync(r.id); toast.success('Pulled back from approval', { description: 'Make your changes, then submit it again.' }) }
      catch (err) { toast.error('Could not edit this request', { description: errorMessage(err) }); return }
    }
    onEdit(r)
  }

  if (loading) {
    return <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
  }
  if (requests.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>

  return (
    <>
      <ul className="divide-y divide-border">
        {requests.map((r) => {
          const step = nextStep(r, ctx)
          const mine = r.user_id === userId
          const opts = mine ? requesterOptions(r) : null
          return (
            <li key={r.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', step.tone === 'you' && 'bg-primary/5', step.tone === 'late' && 'bg-destructive/5')}>
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(r)}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="truncate text-sm font-medium">{showRequester && !mine ? `${r.requester_name ?? 'Someone'} — ` : ''}{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.request_number ?? 'Draft'} · {fundCategoryLabel(r.category)} · {format(new Date(r.submitted_at ?? r.created_at), 'MMM d')}</span>
                </div>
                <p className={cn('mt-1 text-sm', TONE[step.tone])}>{step.text}</p>
                <div className="mt-2"><FundProgress r={r} compact /></div>
              </button>
              <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                <p className="text-sm font-semibold tabular-nums">{formatNaira(Number(r.approved_amount ?? r.amount))}</p>
                <div className="flex items-center gap-1">
                  {step.action && (
                    <Button size="sm" onClick={() => (step.action === 'edit' ? edit(r) : onOpen(r, ACTION_FOCUS[step.action!]))}>
                      {step.actionLabel}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onOpen(r)}><Eye /> View details</DropdownMenuItem>
                      {opts?.canEdit && step.action !== 'edit' && (
                        <DropdownMenuItem onClick={() => edit(r)}><Pencil /> Edit{opts.needsRecall ? ' (pulls it back from approval)' : ''}</DropdownMenuItem>
                      )}
                      {(opts?.canWithdraw || opts?.canDelete) && <DropdownMenuSeparator />}
                      {opts?.canWithdraw && (
                        <DropdownMenuItem onClick={() => setConfirm({ kind: 'withdraw', r })}><Undo2 /> Withdraw request</DropdownMenuItem>
                      )}
                      {opts?.canDelete && (
                        <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({ kind: 'delete', r })}><Trash2 /> Delete draft</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'delete' ? 'Delete this draft?' : 'Withdraw this request?'}
        description={confirm?.kind === 'delete'
          ? 'It was never sent, so it is removed completely.'
          : 'Approvers stop seeing it and it can’t be paid. It stays in your list as Withdrawn for the record.'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete draft' : 'Withdraw'}
        destructive
        loading={cancel.isPending || deleteDraft.isPending}
        onConfirm={async () => {
          if (!confirm) return
          try {
            if (confirm.kind === 'delete') { await deleteDraft.mutateAsync(confirm.r.id); toast.success('Draft deleted') }
            else { await cancel.mutateAsync(confirm.r.id); toast.success('Request withdrawn') }
            setConfirm(null)
          } catch (err) {
            toast.error('Could not do that', { description: errorMessage(err) })
          }
        }}
      />
    </>
  )
}
