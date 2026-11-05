import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Pencil, Printer } from 'lucide-react'
import { printFundVoucher } from '@/features/funds/lib/print-fund-voucher'
import { getSignatures, openBlankPrintWindow } from '@/shared/lib/signatures'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  useFundRequests, useFundApprovalRights, useCancelFundRequest, useDeleteFundDraft, useRecallFundRequest,
} from '@/features/funds/hooks/use-funds'
import { nextStep, requesterOptions, tabForAction, type FundTab } from '@/features/funds/lib/next-step'
import { FundProgress } from '@/features/funds/components/fund-progress'
import { ApprovalChain, Attachments, DecisionBox, Field, PayoutBox } from '@/features/funds/components/fund-request-parts'
import {
  AuditHistory, CloseRetirementBox, ExpenseSubmissions, FinancialSummary, RefundHistory, RetirementStatusBar,
} from '@/features/funds/components/retirement-parts'
import { DISBURSEMENT_METHODS, FUND_STATUS_META, PAID_STATUSES, fundCategoryLabel, fundStatusLabel, outstandingBalance } from '@/features/funds/types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const STEP_TONE: Record<string, string> = {
  you: 'border-primary/40 bg-primary/5',
  late: 'border-destructive/40 bg-destructive/10',
  waiting: 'border-border bg-muted/40',
  done: 'border-success/40 bg-success/10',
  stopped: 'border-border bg-muted/40',
}

/** A fund request on its own page: the next step on top, then one tab at a
 * time — Overview, Expenses, Refunds, Financial summary, History. */
export function FundRequestPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { activeOrgId, activeMembership, userId } = useAuth()
  const { data: requests, isLoading } = useFundRequests(activeOrgId)
  const { canActOn, canApproveClaim, canFinance } = useFundApprovalRights()
  const cancel = useCancelFundRequest(activeOrgId)
  const deleteDraft = useDeleteFundDraft(activeOrgId)
  const recall = useRecallFundRequest(activeOrgId)
  const [showEarlier, setShowEarlier] = React.useState(false)
  const [confirm, setConfirm] = React.useState<'withdraw' | 'delete' | null>(null)

  const r = requests?.find((x) => x.id === id) ?? null
  const paid = r ? PAID_STATUSES.includes(r.status) : false
  const requested = params.get('tab') as FundTab | null
  const tab: FundTab = requested && (paid || requested === 'overview' || requested === 'history') ? requested : 'overview'
  const setTab = (t: FundTab) => {
    const next = new URLSearchParams(params)
    if (t === 'overview') next.delete('tab')
    else next.set('tab', t)
    setParams(next, { replace: true })
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (!r) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium">Request not found</p>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or you don’t have access to it.</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/hr/funds">Back to Fund Requests</Link></Button>
      </Card>
    )
  }

  const isMine = r.user_id === userId
  const canManage = canFinance(r)
  const step = nextStep(r, { userId, canActOn, canApproveClaim, canManage })
  const opts = isMine ? requesterOptions(r) : null
  const meta = FUND_STATUS_META[r.status] ?? { label: r.status, variant: 'muted' as const }
  const partial = r.approved_amount != null && Number(r.approved_amount) < Number(r.amount)
  const earlier = r.approvals.filter((a) => a.round < r.current_round)
  const returnNote = r.status === 'returned' ? r.chain.find((a) => a.status === 'returned')?.comment : null
  const pendingLines = r.items.filter((i) => i.review_status === 'submitted').length
  const pendingRefunds = r.refunds.filter((f) => ['declared', 'claimed', 'approved'].includes(f.status)).length

  // Signed by the requester, the approvers and whoever paid it out.
  const printVoucher = async () => {
    if (!activeMembership) return
    const win = openBlankPrintWindow()
    const signatures = await getSignatures([r.user_id, r.disbursed_by, ...r.approvals.map((a) => a.acted_by)])
    printFundVoucher(r, activeMembership.organization, { signatures, win })
  }

  const startEdit = async () => {
    if (opts?.needsRecall) {
      try { await recall.mutateAsync(r.id); toast.success('Pulled back from approval', { description: 'Make your changes, then submit it again.' }) }
      catch (err) { toast.error('Could not edit this request', { description: errorMessage(err) }); return }
    }
    navigate(`/hr/funds/${r.id}/edit`)
  }

  const tabs: { key: FundTab; label: string; show: boolean; count?: number }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'expenses', label: 'Expenses', show: paid, count: pendingLines },
    { key: 'refunds', label: 'Refunds & reimbursements', show: paid, count: pendingRefunds },
    { key: 'summary', label: 'Financial summary', show: paid },
    { key: 'history', label: 'History', show: true },
  ]

  return (
    <div className="w-full">
      <Link to="/hr/funds" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Fund Requests
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight">{r.title}</h1>
            <Badge variant={meta.variant}>{fundStatusLabel(r)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {r.request_number ?? 'Draft'} · {isMine ? 'your request' : `requested by ${r.requester_name ?? 'a colleague'}`}
            {r.submitted_at ? ` · submitted ${format(new Date(r.submitted_at), 'MMM d, yyyy')}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          {r.status !== 'draft' && (
            <Button variant="outline" size="sm" onClick={printVoucher}><Printer className="h-4 w-4" /> Print voucher</Button>
          )}
          <p className="font-display text-2xl font-semibold tabular-nums">{formatNaira(Number(r.approved_amount ?? r.amount))}</p>
          {paid && outstandingBalance(r) !== 0 && (
            <p className={cn('text-sm', outstandingBalance(r) > 0 ? 'text-warning' : 'text-destructive')}>
              {formatNaira(Math.abs(outstandingBalance(r)))} {outstandingBalance(r) > 0 ? 'outstanding' : 'owed to employee'}
            </p>
          )}
        </div>
      </div>

      <Card className="mb-5 p-5"><FundProgress r={r} /></Card>

      <div className={cn('mb-6 rounded-lg border p-4', STEP_TONE[step.tone])}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What happens next</p>
        <p className="mt-1 font-medium">{step.text}</p>
        {returnNote && isMine && <p className="mt-1 text-sm">Approver's note: “{returnNote}”</p>}
        {(step.action || opts?.canEdit || opts?.canWithdraw || opts?.canDelete) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {step.action === 'edit' && <Button onClick={startEdit} loading={recall.isPending}>{step.actionLabel}</Button>}
            {step.action && step.action !== 'edit' && (
              <Button onClick={() => setTab(tabForAction(r, step.action))}>{step.actionLabel}</Button>
            )}
            {opts?.canEdit && step.action !== 'edit' && (
              <Button variant="outline" onClick={startEdit} loading={recall.isPending}><Pencil className="h-4 w-4" /> Edit request</Button>
            )}
            {opts?.canWithdraw && <Button variant="ghost" onClick={() => setConfirm('withdraw')}>Withdraw</Button>}
            {opts?.canDelete && <Button variant="ghost" className="text-destructive" onClick={() => setConfirm('delete')}>Delete draft</Button>}
          </div>
        )}
        {opts?.needsRecall && <p className="mt-2 text-xs text-muted-foreground">You can edit until an approver acts on it — editing pulls it back and you resubmit.</p>}
      </div>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count ? <span className="rounded-full bg-primary/15 px-1.5 text-[11px] text-primary">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            {canActOn(r) && <DecisionBox key={r.id + r.current_step} request={r} />}
            {canManage && !isMine && (r.status === 'approved' || r.status === 'payment_processing') && <PayoutBox key={r.id} request={r} />}
            <Card className="space-y-5 p-5">
              <p className="font-display text-base font-semibold">Request</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Requested"><span className="font-semibold">{formatNaira(Number(r.amount))}</span></Field>
                <Field label="Approved">{r.approved_amount != null ? <span className={cn(partial && 'text-warning')}>{formatNaira(Number(r.approved_amount))}</span> : '—'}</Field>
                <Field label="Category">{fundCategoryLabel(r.category)}</Field>
                <Field label="Needed by">{r.needed_by ? format(new Date(r.needed_by), 'MMM d, yyyy') : '—'}</Field>
                <Field label="Client">{r.client_label ?? '—'}</Field>
                <Field label="Matter">{r.matter_label ?? '—'}</Field>
              </div>
              {r.purpose && <div><p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Purpose</p><p className="whitespace-pre-wrap text-sm">{r.purpose}</p></div>}
              <Attachments request={r} editable={isMine && ['draft', 'returned', 'pending'].includes(r.status)} />
            </Card>
            {r.disbursed_at && (
              <Card className="space-y-4 p-5">
                <p className="font-display text-base font-semibold">Payment</p>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Field label="Paid out">{formatNaira(Number(r.disbursed_amount ?? 0))}</Field>
                  <Field label="Payment date">{format(new Date(r.payment_date ?? r.disbursed_at), 'MMM d, yyyy')}</Field>
                  <Field label="Paid by">{r.disbursed_by_name ?? '—'}</Field>
                  <Field label="Method / ref">
                    {[DISBURSEMENT_METHODS.find((m) => m.value === r.disbursement_method)?.label ?? r.disbursement_method, r.disbursement_reference].filter(Boolean).join(' · ') || '—'}
                  </Field>
                </div>
                {r.disbursement_notes && <Field label="Payment notes">{r.disbursement_notes}</Field>}
              </Card>
            )}
          </div>
          <Card className="h-fit p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-base font-semibold">Approvals{r.current_round > 1 ? ` · round ${r.current_round}` : ''}</p>
              {earlier.length > 0 && (
                <button className="text-xs text-primary hover:underline" onClick={() => setShowEarlier((s) => !s)}>{showEarlier ? 'Hide' : 'Show'} earlier</button>
              )}
            </div>
            {r.chain.length > 0 ? <ApprovalChain approvals={r.chain} requested={Number(r.amount)} /> : <p className="text-sm text-muted-foreground">Not submitted yet.</p>}
            {showEarlier && [...new Set(earlier.map((a) => a.round))].map((round) => (
              <div key={round} className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Round {round}</p>
                <ApprovalChain approvals={earlier.filter((a) => a.round === round)} requested={Number(r.amount)} />
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'expenses' && paid && (
        <div className="space-y-5">
          <RetirementStatusBar r={r} />
          {r.retirement_note && r.status === 'retirement_submitted' && <p className="text-sm text-muted-foreground">Employee's note: {r.retirement_note}</p>}
          <Card className="p-5"><ExpenseSubmissions r={r} isMine={isMine} canVerify={canManage && !isMine} /></Card>
        </div>
      )}

      {tab === 'refunds' && paid && (
        <div className="space-y-5">
          <RetirementStatusBar r={r} />
          <Card className="p-5"><RefundHistory r={r} isMine={isMine} canVerify={canManage && !isMine} /></Card>
        </div>
      )}

      {tab === 'summary' && paid && (
        <div className="space-y-5">
          <RetirementStatusBar r={r} />
          <div className="grid gap-5 lg:grid-cols-2">
            <FinancialSummary r={r} />
            <div className="space-y-5"><CloseRetirementBox r={r} /></div>
          </div>
        </div>
      )}

      {tab === 'history' && <Card className="p-5"><AuditHistory requestId={r.id} /></Card>}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'delete' ? 'Delete this draft?' : 'Withdraw this request?'}
        description={confirm === 'delete'
          ? 'It was never sent, so it is removed completely.'
          : 'Approvers stop seeing it and it can’t be paid. It stays in your list as Withdrawn for the record.'}
        confirmLabel={confirm === 'delete' ? 'Delete draft' : 'Withdraw'}
        destructive
        loading={cancel.isPending || deleteDraft.isPending}
        onConfirm={async () => {
          try {
            if (confirm === 'delete') { await deleteDraft.mutateAsync(r.id); toast.success('Draft deleted'); navigate('/hr/funds') }
            else { await cancel.mutateAsync(r.id); toast.success('Request withdrawn') }
            setConfirm(null)
          } catch (err) {
            toast.error('Could not do that', { description: errorMessage(err) })
          }
        }}
      />
    </div>
  )
}
