import * as React from 'react'
import { format } from 'date-fns'
import { Check, X, Circle, Clock, Paperclip, Trash2, CornerUpLeft, MinusCircle } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useDecideFundRequest, useCancelFundRequest, useDisburseFundRequest, useFundApprovalRights, useMarkPaymentProcessing,
  useDeleteFundDraft, useUploadFundAttachment, useDeleteFundAttachment,
} from '@/features/funds/hooks/use-funds'
import { fundsService } from '@/features/funds/services/funds.service'
import { RetirementPanel } from '@/features/funds/components/retirement-panel'
import { FundRequestFormDialog, ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES } from '@/features/funds/components/fund-request-form-dialog'
import {
  FUND_STATUS_META, DISBURSEMENT_METHODS, fundCategoryLabel, fundStatusLabel, PAID_STATUSES,
  type FundRequest, type FundApproval, type FundAttachment,
} from '@/features/funds/types'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const today = () => new Date().toISOString().slice(0, 10)

async function openFile(path: string) {
  try { window.open(await fundsService.fileUrl(path), '_blank', 'noopener') }
  catch (err) { toast.error('Could not open file', { description: errorMessage(err) }) }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}

function StepIcon({ status }: { status: string }) {
  if (status === 'approved') return <Check className="h-4 w-4 text-success" />
  if (status === 'rejected') return <X className="h-4 w-4 text-destructive" />
  if (status === 'returned') return <CornerUpLeft className="h-4 w-4 text-warning" />
  if (status === 'pending') return <Clock className="h-4 w-4 text-warning" />
  if (status === 'skipped') return <MinusCircle className="h-4 w-4 text-muted-foreground/60" />
  return <Circle className="h-4 w-4 text-muted-foreground/50" />
}

const ACTED: Record<string, string> = { approved: 'Approved', rejected: 'Rejected', returned: 'Returned for clarification' }

function ApprovalChain({ approvals, requested }: { approvals: FundApproval[]; requested: number }) {
  const parallel = (step: number) => approvals.filter((a) => a.step === step).length > 1
  return (
    <ol className="space-y-3">
      {approvals.map((a) => (
        <li key={a.id} className="flex gap-3">
          <div className="mt-0.5"><StepIcon status={a.status} /></div>
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {a.step_name ?? a.stage}
              {a.approver_name && (a.approver_type === 'line_manager' || a.approver_type === 'department_head' || a.approver_type === 'specific_user') ? ` — ${a.approver_name}` : ''}
              {parallel(a.step) && <span className="ml-1 text-xs font-normal text-muted-foreground">(in parallel)</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {ACTED[a.status]
                ? `${ACTED[a.status]} by ${a.actor_name ?? 'someone'}${a.acted_as_delegate_for ? ' (as delegate)' : ''}${a.acted_at ? ` · ${format(new Date(a.acted_at), 'MMM d, yyyy h:mm a')}` : ''}`
                : a.status === 'pending' ? 'Waiting for a decision'
                : a.status === 'skipped' ? (a.comment ?? 'Not needed') : 'Up next'}
              {a.status === 'approved' && a.approved_amount != null && Number(a.approved_amount) < requested ? ` · approved ${formatNaira(Number(a.approved_amount))}` : ''}
            </p>
            {a.comment && a.status !== 'skipped' && <p className="mt-1 text-xs italic text-muted-foreground">“{a.comment}”</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function DecisionBox({ request }: { request: FundRequest }) {
  const { activeOrgId } = useAuth()
  const decide = useDecideFundRequest(activeOrgId)
  const ceiling = Number(request.approved_amount ?? request.amount)
  const [comment, setComment] = React.useState('')
  const [amount, setAmount] = React.useState(String(ceiling))
  const run = async (decision: 'approve' | 'reject' | 'return') => {
    const value = Number(amount)
    if (decision === 'approve' && !(value > 0 && value <= ceiling)) { toast.error(`Approve an amount between ₦1 and ${formatNaira(ceiling)}`); return }
    try {
      await decide.mutateAsync({ id: request.id, decision, comment: comment.trim() || undefined, amount: decision === 'approve' && value < ceiling ? value : undefined })
      toast.success(decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Returned for clarification')
      setComment('')
    } catch (err) {
      toast.error('Action failed', { description: errorMessage(err) })
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">Your decision</p>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1.5">
          <Label>Approve amount (₦)</Label>
          <Input type="number" min={0} max={ceiling} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Comment</Label>
          <Textarea rows={2} placeholder="Required if rejecting or returning" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => run('reject')} disabled={decide.isPending}>Reject</Button>
        <Button variant="outline" size="sm" onClick={() => run('return')} disabled={decide.isPending}>Return for clarification</Button>
        <Button size="sm" onClick={() => run('approve')} loading={decide.isPending}>
          {Number(amount) < ceiling ? 'Approve partially' : 'Approve'}
        </Button>
      </div>
    </div>
  )
}

function PayoutBox({ request }: { request: FundRequest }) {
  const { activeOrgId } = useAuth()
  const disburse = useDisburseFundRequest(activeOrgId)
  const processing = useMarkPaymentProcessing(activeOrgId)
  const approved = Number(request.approved_amount ?? request.amount)
  const [amount, setAmount] = React.useState(String(approved))
  const [method, setMethod] = React.useState('bank_transfer')
  const [reference, setReference] = React.useState('')
  const [paidOn, setPaidOn] = React.useState(today())
  const [notes, setNotes] = React.useState('')
  const [proof, setProof] = React.useState<File | null>(null)

  const run = async () => {
    const value = Number(amount)
    if (!(value > 0 && value <= approved)) { toast.error(`Enter an amount up to the approved ${formatNaira(approved)}`); return }
    if (proof && (!ATTACHMENT_MIME_TYPES.includes(proof.type) || proof.size > MAX_ATTACHMENT_BYTES)) { toast.error('Payment proof must be a PDF or image up to 10 MB'); return }
    try {
      await disburse.mutateAsync({ id: request.id, amount: value, method, reference: reference.trim(), paidOn, notes: notes.trim(), proof })
      toast.success('Payout recorded', { description: 'The requester has been asked to retire it with receipts.' })
    } catch (err) {
      toast.error('Could not record payout', { description: errorMessage(err) })
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Record payout <span className="font-normal text-muted-foreground">· approved {formatNaira(approved)}</span></p>
        {request.status === 'approved' && (
          <Button
            size="sm" variant="outline" loading={processing.isPending}
            onClick={async () => {
              try { await processing.mutateAsync(request.id); toast.success('Marked as payment processing') }
              catch (err) { toast.error('Action failed', { description: errorMessage(err) }) }
            }}
          >
            Mark payment processing
          </Button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Amount paid (₦)</Label>
          <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Payment date</Label>
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Method</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISBURSEMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Reference</Label>
          <Input placeholder="Transfer / cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Payment proof (optional)</Label>
          <input type="file" accept={ATTACHMENT_MIME_TYPES.join(',')} className="block max-w-full text-xs" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={run} loading={disburse.isPending}>Record payout</Button>
      </div>
    </div>
  )
}

function Attachments({ request, editable }: { request: FundRequest; editable: boolean }) {
  const { activeOrgId } = useAuth()
  const upload = useUploadFundAttachment(activeOrgId)
  const remove = useDeleteFundAttachment(activeOrgId)
  const list = request.attachments
  if (list.length === 0 && !editable) return null
  const label = (a: FundAttachment) => (a.kind === 'payment_proof' ? 'Payment proof' : 'Supporting')
  return (
    <section>
      <p className="mb-2 font-display text-sm font-semibold">Attachments</p>
      {list.length > 0 && (
        <ul className="mb-2 space-y-1 text-sm">
          {list.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-3 py-1.5">
              <button className="flex min-w-0 items-center gap-1.5 text-primary hover:underline" onClick={() => openFile(a.storage_path)}>
                <Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{a.file_name}</span>
              </button>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {label(a)}
                {editable && a.kind === 'supporting' && (
                  <button aria-label={`Remove ${a.file_name}`} onClick={() => remove.mutate(a, { onError: (e) => toast.error('Could not remove', { description: errorMessage(e) }) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <input
          type="file" accept={ATTACHMENT_MIME_TYPES.join(',')} className="block max-w-full text-xs" disabled={upload.isPending}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (!ATTACHMENT_MIME_TYPES.includes(f.type) || f.size > MAX_ATTACHMENT_BYTES) { toast.error('Attach PDFs, images, Word or Excel files up to 10 MB'); return }
            try { await upload.mutateAsync({ requestId: request.id, file: f }); toast.success('Attached') }
            catch (err) { toast.error('Could not attach', { description: errorMessage(err) }) }
          }}
        />
      )}
    </section>
  )
}

export function FundRequestDetailDialog({ request, onOpenChange }: { request: FundRequest | null; onOpenChange: (open: boolean) => void }) {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { canActOn } = useFundApprovalRights()
  const cancel = useCancelFundRequest(activeOrgId)
  const deleteDraft = useDeleteFundDraft(activeOrgId)
  const [editing, setEditing] = React.useState(false)
  const [showHistory, setShowHistory] = React.useState(false)

  if (!request) return <Dialog open={false} onOpenChange={onOpenChange} />

  const r = request
  const meta = FUND_STATUS_META[r.status] ?? { label: r.status, variant: 'muted' as const }
  const isMine = r.user_id === userId
  const canManage = has('funds.manage')
  const showRetirement = PAID_STATUSES.includes(r.status)
  const earlier = r.approvals.filter((a) => a.round < r.current_round)
  const partial = r.approved_amount != null && Number(r.approved_amount) < Number(r.amount)

  return (
    <>
      <Dialog open={!editing} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{r.title}</DialogTitle>
              <Badge variant={meta.variant}>{fundStatusLabel(r)}</Badge>
            </div>
            <DialogDescription>
              {r.request_number ?? 'Draft'} · {isMine ? 'your request' : `requested by ${r.requester_name ?? 'a colleague'}`}
              {r.submitted_at ? ` · submitted ${format(new Date(r.submitted_at), 'MMM d, yyyy')}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Requested"><span className="font-display text-lg font-semibold">{formatNaira(Number(r.amount))}</span></Field>
              <Field label="Approved">{r.approved_amount != null ? <span className={cn(partial && 'text-warning')}>{formatNaira(Number(r.approved_amount))}</span> : '—'}</Field>
              <Field label="Category">{fundCategoryLabel(r.category)}</Field>
              <Field label="Needed by">{r.needed_by ? format(new Date(r.needed_by), 'MMM d, yyyy') : '—'}</Field>
              {r.client_label && <Field label="Client">{r.client_label}</Field>}
              {r.matter_label && <Field label="Matter">{r.matter_label}</Field>}
            </div>
            {r.purpose && <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{r.purpose}</p>}

            {(isMine && (r.status === 'draft' || r.status === 'returned')) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <span>{r.status === 'draft' ? 'This is a draft — nobody has seen it yet.' : 'An approver asked for clarification. Update the request and resubmit.'}</span>
                <div className="flex gap-2">
                  {r.status === 'draft' && !r.request_number && (
                    <Button
                      size="sm" variant="ghost" loading={deleteDraft.isPending}
                      onClick={async () => {
                        try { await deleteDraft.mutateAsync(r.id); toast.success('Draft deleted'); onOpenChange(false) }
                        catch (err) { toast.error('Could not delete draft', { description: errorMessage(err) }) }
                      }}
                    >
                      Delete draft
                    </Button>
                  )}
                  <Button size="sm" onClick={() => setEditing(true)}>{r.status === 'draft' ? 'Edit & submit' : 'Update & resubmit'}</Button>
                </div>
              </div>
            )}

            {r.chain.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-display text-sm font-semibold">Approvals{r.current_round > 1 ? ` · round ${r.current_round}` : ''}</p>
                  {earlier.length > 0 && (
                    <button className="text-xs text-primary hover:underline" onClick={() => setShowHistory((s) => !s)}>
                      {showHistory ? 'Hide' : 'Show'} earlier rounds
                    </button>
                  )}
                </div>
                <ApprovalChain approvals={r.chain} requested={Number(r.amount)} />
                {showHistory && (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    {[...new Set(earlier.map((a) => a.round))].map((round) => (
                      <div key={round}>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">Round {round}</p>
                        <ApprovalChain approvals={earlier.filter((a) => a.round === round)} requested={Number(r.amount)} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {canActOn(r) && <DecisionBox key={r.id + r.current_step} request={r} />}
            {canManage && (r.status === 'approved' || r.status === 'payment_processing') && <PayoutBox key={r.id} request={r} />}

            <Attachments request={r} editable={isMine && ['draft', 'returned', 'pending'].includes(r.status)} />

            {r.disbursed_at && (
              <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Paid out">{formatNaira(Number(r.disbursed_amount ?? 0))}</Field>
                <Field label="Payment date">{format(new Date(r.payment_date ?? r.disbursed_at), 'MMM d, yyyy')}</Field>
                <Field label="By">{r.disbursed_by_name ?? '—'}</Field>
                <Field label="Method / ref">
                  {[DISBURSEMENT_METHODS.find((m) => m.value === r.disbursement_method)?.label ?? r.disbursement_method, r.disbursement_reference].filter(Boolean).join(' · ') || '—'}
                </Field>
                {r.disbursement_notes && <div className="col-span-full"><Field label="Payment notes">{r.disbursement_notes}</Field></div>}
              </section>
            )}

            {showRetirement && (
              <section className="border-t border-border pt-5">
                {r.retirement_note && r.status === 'retirement_submitted' && (
                  <p className="mb-3 text-sm text-muted-foreground">Employee's note: {r.retirement_note}</p>
                )}
                <RetirementPanel r={r} />
              </section>
            )}

            {isMine && ['pending', 'approved', 'returned'].includes(r.status) && (
              <div className="flex justify-end">
                <Button
                  variant="ghost" size="sm" loading={cancel.isPending}
                  onClick={async () => {
                    try { await cancel.mutateAsync(r.id); toast.success('Request withdrawn') }
                    catch (err) { toast.error('Could not withdraw', { description: errorMessage(err) }) }
                  }}
                >
                  Withdraw this request
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <FundRequestFormDialog open={editing} onOpenChange={setEditing} request={r} />
    </>
  )
}
