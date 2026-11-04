import * as React from 'react'
import { format } from 'date-fns'
import { Paperclip, Trash2, AlertTriangle, Undo2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useAddRetirementItem, useDeleteRetirementItem, useSubmitRetirement, useReviewItems, useDeclareRefund, useVerifyRefund,
  useRecordRefund, useRecordReimbursement, useWithdrawRetirementItem, useWithdrawRefund, useCloseRetirement, useSetRetirementDueDate, useFundRequestHistory,
} from '@/features/funds/hooks/use-funds'
import { fundsService } from '@/features/funds/services/funds.service'
import {
  DISBURSEMENT_METHODS, FUND_CATEGORIES, REFUND_STATUS_META, RETIREMENT_STATUS_META, fundCategoryLabel, isRetirementOverdue,
  outstandingBalance, OPEN_ADVANCE_STATUSES, type FundRequest, type FundRefund,
} from '@/features/funds/types'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_BYTES = 10 * 1024 * 1024
const today = () => new Date().toISOString().slice(0, 10)
const NONE = '__none__'

async function openFile(path: string) {
  try { window.open(await fundsService.fileUrl(path), '_blank', 'noopener') }
  catch (err) { toast.error('Could not open file', { description: errorMessage(err) }) }
}
const fileOk = (f: File | null) => !f || (RECEIPT_TYPES.includes(f.type) && f.size <= MAX_BYTES)

const LINE_STATUS: Record<string, { label: string; variant: 'muted' | 'default' | 'success' | 'destructive' }> = {
  draft: { label: 'Not sent', variant: 'muted' },
  submitted: { label: 'Pending verification', variant: 'default' },
  accepted: { label: 'Verified', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
}

function Heading({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p className="font-display text-sm font-semibold">{title}</p>
      {right}
    </div>
  )
}

// ---- D. Financial summary -------------------------------------------------
export function FinancialSummary({ r }: { r: FundRequest }) {
  const outstanding = outstandingBalance(r)
  const rows: [string, number, string?][] = [
    ['Approved', Number(r.approved_amount ?? r.amount)],
    ['Disbursed', Number(r.disbursed_amount ?? 0)],
    ['Expenses submitted (pending)', Number(r.submitted_expenses ?? 0), 'Not counted until verified'],
    ['Expenses verified', Number(r.accepted_amount ?? 0)],
    ['Refunds pending verification', Number(r.pending_refunds ?? 0), 'Not counted until confirmed'],
    ['Refunds confirmed', Number(r.refunded_amount ?? 0)],
  ]
  if (Number(r.reimbursed_amount) > 0) rows.push(['Reimbursed to employee', Number(r.reimbursed_amount)])
  return (
    <div className="rounded-lg border border-border">
      <dl className="divide-y divide-border text-sm">
        {rows.map(([label, value, hint]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{label}{hint && <span className="ml-1 text-[11px]">· {hint}</span>}</dt>
            <dd className="tabular-nums">{formatNaira(value)}</dd>
          </div>
        ))}
        <div className={cn('flex items-center justify-between gap-3 px-3 py-2.5', outstanding > 0 ? 'bg-warning/10' : outstanding < 0 ? 'bg-destructive/10' : 'bg-success/10')}>
          <dt className="font-medium">
            {outstanding > 0 ? 'Outstanding — employee still to account for' : outstanding < 0 ? 'Spent above the advance — owed to employee' : 'Outstanding balance'}
          </dt>
          <dd className="font-display text-base font-semibold tabular-nums">{formatNaira(Math.abs(outstanding))}</dd>
        </div>
      </dl>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Outstanding = disbursed − verified expenses − confirmed refunds{Number(r.reimbursed_amount) > 0 ? ' + reimbursements' : ''}. Calculated by the server from the records below.</p>
    </div>
  )
}

// ---- B. Expense submissions ----------------------------------------------
export function ExpenseSubmissions({ r, isMine, canVerify }: { r: FundRequest; isMine: boolean; canVerify: boolean }) {
  const { activeOrgId } = useAuth()
  const add = useAddRetirementItem(activeOrgId)
  const remove = useDeleteRetirementItem(activeOrgId)
  const withdraw = useWithdrawRetirementItem(activeOrgId)
  const submit = useSubmitRetirement(activeOrgId)
  const review = useReviewItems(activeOrgId)
  const editable = isMine && OPEN_ADVANCE_STATUSES.includes(r.status)
  const drafts = r.items.filter((i) => i.review_status === 'draft')
  const pending = r.items.filter((i) => i.review_status === 'submitted')

  const [form, setForm] = React.useState({ description: '', amount: '', spentOn: today(), category: '', vendor: '', notes: '' })
  const [receipt, setReceipt] = React.useState<File | null>(null)
  const [note, setNote] = React.useState('')
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [decisions, setDecisions] = React.useState<Record<string, { decision: 'accept' | 'reject' | 'return'; comment: string }>>({})
  React.useEffect(() => {
    setDecisions(Object.fromEntries(pending.map((i) => [i.id, { decision: 'accept' as const, comment: '' }])))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.map((i) => i.id).join(',')])

  const addLine = async () => {
    const value = Number(form.amount)
    if (!form.description.trim() || form.amount === '' || !(value >= 0)) { toast.error('Describe the expense and enter what it cost'); return }
    if (!fileOk(receipt)) { toast.error('Receipts must be a PDF or image up to 10 MB'); return }
    try {
      await add.mutateAsync({
        requestId: r.id, description: form.description.trim(), amount: value, spentOn: form.spentOn,
        category: form.category, vendor: form.vendor.trim(), notes: form.notes.trim(), receipt,
      })
      setForm((f) => ({ ...f, description: '', amount: '', vendor: '', notes: '' })); setReceipt(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      toast.error('Could not add expense', { description: errorMessage(err) })
    }
  }

  const sendBatch = async () => {
    try {
      await submit.mutateAsync({ id: r.id, note: note.trim() })
      setNote('')
      toast.success('Sent to finance for verification', { description: 'You can submit more later — the balance stays open until it’s fully accounted for.' })
    } catch (err) {
      toast.error('Could not submit', { description: errorMessage(err) })
    }
  }

  const saveReview = async () => {
    const list = pending.map((i) => ({ id: i.id, decision: decisions[i.id]?.decision ?? 'accept', comment: decisions[i.id]?.comment?.trim() || undefined }))
    const missing = list.find((d) => d.decision !== 'accept' && !d.comment)
    if (missing) { toast.error('Add a comment to every line you reject or return'); return }
    try {
      await review.mutateAsync({ id: r.id, decisions: list })
      toast.success('Verification saved')
    } catch (err) {
      toast.error('Could not save verification', { description: errorMessage(err) })
    }
  }

  return (
    <section>
      <Heading title="Expense submissions" />
      {r.items.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">No expenses submitted yet.</p> : (
        <div className="mb-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Expense</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Receipt</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {(editable || (canVerify && pending.length > 0)) && <th className="px-3 py-2 font-medium">{editable ? 'Actions' : 'Your decision'}</th>}
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => {
                const st = LINE_STATUS[i.review_status] ?? LINE_STATUS.draft
                const d = decisions[i.id]
                return (
                  <tr key={i.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-3 py-2">
                      <p>{i.description}</p>
                      <p className="text-xs text-muted-foreground">{[i.category && fundCategoryLabel(i.category), i.vendor, i.notes].filter(Boolean).join(' · ')}</p>
                      {i.review_comment && <p className={cn('mt-0.5 text-xs', i.review_status === 'rejected' ? 'text-destructive' : 'text-warning')}>Finance: {i.review_comment}</p>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{i.spent_on ? format(new Date(i.spent_on), 'MMM d') : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNaira(Number(i.amount))}</td>
                    <td className="px-3 py-2">
                      {i.receipt_path ? (
                        <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => openFile(i.receipt_path!)}><Paperclip className="h-3.5 w-3.5" /> View</button>
                      ) : <span className="text-xs text-warning">No receipt</span>}
                    </td>
                    <td className="px-3 py-2"><Badge variant={st.variant}>{st.label}</Badge></td>
                    {canVerify && i.review_status === 'submitted' && d ? (
                      <td className="min-w-[220px] space-y-1.5 px-3 py-2">
                        <Select value={d.decision} onValueChange={(v) => setDecisions((all) => ({ ...all, [i.id]: { ...d, decision: v as 'accept' | 'reject' | 'return' } }))}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="accept">Verify</SelectItem>
                            <SelectItem value="return">Return for correction</SelectItem>
                            <SelectItem value="reject">Reject</SelectItem>
                          </SelectContent>
                        </Select>
                        {d.decision !== 'accept' && (
                          <Input className="h-8" placeholder="Reason (required)" value={d.comment} onChange={(e) => setDecisions((all) => ({ ...all, [i.id]: { ...d, comment: e.target.value } }))} />
                        )}
                      </td>
                    ) : editable ? (
                      <td className="px-2 py-2">
                        {i.review_status === 'draft' && (
                          <Button
                            variant="ghost" size="sm" className="text-destructive"
                            onClick={() => remove.mutate(i, { onSuccess: () => toast.success('Expense deleted'), onError: (e) => toast.error('Could not delete', { description: errorMessage(e) }) })}
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </Button>
                        )}
                        {i.review_status === 'submitted' && (
                          <Button
                            variant="ghost" size="sm" title="Take it back from finance so you can change or delete it"
                            onClick={() => withdraw.mutate(i.id, { onSuccess: () => toast.success('Withdrawn — you can now change or delete it'), onError: (e) => toast.error('Could not withdraw', { description: errorMessage(e) }) })}
                          >
                            <Undo2 className="h-4 w-4" /> Withdraw
                          </Button>
                        )}
                        {(i.review_status === 'accepted' || i.review_status === 'rejected') && <span className="text-xs text-muted-foreground">Locked</span>}
                      </td>
                    ) : (canVerify && pending.length > 0) ? <td /> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {canVerify && pending.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm">{pending.length} line{pending.length === 1 ? '' : 's'} · {formatNaira(pending.reduce((s, i) => s + Number(i.amount), 0))} awaiting your verification</p>
          <Button size="sm" onClick={saveReview} loading={review.isPending}>Save verification</Button>
        </div>
      )}

      {editable && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Add an expense</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_130px_150px]">
            <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <Input type="number" min={0} step="0.01" placeholder="Amount ₦" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Input type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={form.category || NONE} onValueChange={(v) => setForm({ ...form, category: v === NONE ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No category</SelectItem>
                {FUND_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Vendor / service provider" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            <Input placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input ref={fileRef} type="file" accept={RECEIPT_TYPES.join(',')} className="max-w-full text-xs" onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} />
            <Button size="sm" variant="outline" onClick={addLine} loading={add.isPending}>Add expense</Button>
          </div>
          <p className="text-xs text-muted-foreground">Unsent expenses can be deleted. Sent ones can be withdrawn until finance checks them. Once verified or rejected, they're locked for the record.</p>
          <div className="space-y-1.5 border-t border-border pt-3">
            <Label>Note to finance (optional)</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Submit some receipts now and the rest later.</p>
              <Button size="sm" onClick={sendBatch} loading={submit.isPending} disabled={drafts.length === 0}>
                Submit {drafts.length || ''} line{drafts.length === 1 ? '' : 's'} for verification
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ---- C. Refund history ----------------------------------------------------
function RefundRow({ f, r, canVerify, isMine }: { f: FundRefund; r: FundRequest; canVerify: boolean; isMine: boolean }) {
  const { activeOrgId } = useAuth()
  const verify = useVerifyRefund(activeOrgId)
  const withdraw = useWithdrawRefund(activeOrgId)
  const [reason, setReason] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const st = REFUND_STATUS_META[f.status] ?? { label: f.status, variant: 'muted' as const }
  const unaccounted = outstandingBalance(r)
  const excess = Number(f.amount) > unaccounted
  const act = async (confirm: boolean) => {
    if ((!confirm || excess) && !reason.trim()) { toast.error(confirm ? 'Give a reason for accepting more than the balance' : 'Give a reason for rejecting'); return }
    try {
      await verify.mutateAsync({ refundId: f.id, confirm, reason: reason.trim() || undefined, allowExcess: confirm && excess })
      toast.success(confirm ? 'Refund confirmed' : 'Refund rejected')
      setOpen(false)
    } catch (err) {
      toast.error('Action failed', { description: errorMessage(err) })
    }
  }
  return (
    <li className="space-y-2 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p>
            <span className="font-medium tabular-nums">{formatNaira(Number(f.amount))}</span>
            {f.direction === 'reimbursement' && <span className="ml-1 text-xs text-muted-foreground">paid to employee</span>}
            <span className="text-muted-foreground"> · {format(new Date(f.received_on), 'MMM d, yyyy')}</span>
            {[DISBURSEMENT_METHODS.find((m) => m.value === f.method)?.label ?? f.method, f.reference].filter(Boolean).map((x) => <span key={x} className="text-muted-foreground"> · {x}</span>)}
          </p>
          {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
          {f.evidence_path && (
            <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => openFile(f.evidence_path!)}>
              <Paperclip className="h-3 w-3" /> {f.evidence_name ?? 'Evidence'}
            </button>
          )}
          {f.rejection_reason && <p className="text-xs text-destructive">Rejected: {f.rejection_reason}</p>}
          {f.is_exception && <p className="text-xs text-warning">Accepted above the balance: {f.exception_reason}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={st.variant}>{st.label}</Badge>
          {canVerify && f.status === 'declared' && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Verify</Button>}
          {isMine && f.status === 'declared' && (
            <Button
              size="sm" variant="ghost" loading={withdraw.isPending}
              onClick={() => withdraw.mutate(f.id, { onSuccess: () => toast.success('Refund declaration withdrawn'), onError: (e) => toast.error('Could not withdraw', { description: errorMessage(e) }) })}
            >
              <Undo2 className="h-4 w-4" /> Withdraw
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3">
          {excess && <p className="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" /> This is more than the unaccounted balance ({formatNaira(Math.max(unaccounted, 0))}). Confirming needs a reason.</p>}
          <Input placeholder={excess ? 'Reason (required)' : 'Reason (required to reject)'} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="outline" onClick={() => act(false)} disabled={verify.isPending}>Reject</Button>
            <Button size="sm" onClick={() => act(true)} loading={verify.isPending}>Confirm received</Button>
          </div>
        </div>
      )}
    </li>
  )
}

function MoneyForm({ title, submitLabel, defaultAmount, withEvidence, busy, onSubmit }: {
  title: string; submitLabel: string; defaultAmount: number; withEvidence?: boolean; busy: boolean
  onSubmit: (v: { amount: number; date: string; method: string; reference: string; notes: string; evidence: File | null }) => Promise<boolean>
}) {
  const [v, setV] = React.useState({ amount: defaultAmount > 0 ? String(defaultAmount) : '', date: today(), method: 'bank_transfer', reference: '', notes: '' })
  const [evidence, setEvidence] = React.useState<File | null>(null)
  const run = async () => {
    const amount = Number(v.amount)
    if (!(amount > 0)) { toast.error('Enter an amount'); return }
    if (!fileOk(evidence)) { toast.error('Evidence must be a PDF or image up to 10 MB'); return }
    if (await onSubmit({ amount, date: v.date, method: v.method, reference: v.reference.trim(), notes: v.notes.trim(), evidence })) {
      setV((x) => ({ ...x, reference: '', notes: '' })); setEvidence(null)
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" min={0} step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></div>
        <div className="space-y-1.5">
          <Label>Method</Label>
          <Select value={v.method} onValueChange={(m) => setV({ ...v, method: m })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DISBURSEMENT_METHODS.filter((m) => m.value !== 'cheque').map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Transaction reference</Label><Input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} /></div>
      </div>
      <Input placeholder="Notes (optional)" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      {withEvidence && (
        <div className="space-y-1.5"><Label>Payment receipt / evidence</Label>
          <input type="file" accept={RECEIPT_TYPES.join(',')} className="block max-w-full text-xs" onChange={(e) => setEvidence(e.target.files?.[0] ?? null)} />
        </div>
      )}
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={run} loading={busy}>{submitLabel}</Button></div>
    </div>
  )
}

export function RefundHistory({ r, isMine, canVerify }: { r: FundRequest; isMine: boolean; canVerify: boolean }) {
  const { activeOrgId } = useAuth()
  const declare = useDeclareRefund(activeOrgId)
  const record = useRecordRefund(activeOrgId)
  const reimburse = useRecordReimbursement(activeOrgId)
  const open = OPEN_ADVANCE_STATUSES.includes(r.status)
  const outstanding = outstandingBalance(r)
  const unaccounted = outstanding - Number(r.pending_refunds ?? 0)

  return (
    <section>
      <Heading title="Refunds" />
      {r.refunds.length === 0 ? <p className="mb-3 text-sm text-muted-foreground">No refunds yet.</p> : (
        <ul className="mb-3 divide-y divide-border rounded-lg border border-border">
          {r.refunds.map((f) => <RefundRow key={f.id} f={f} r={r} canVerify={canVerify} isMine={isMine} />)}
        </ul>
      )}
      <div className="space-y-3">
        {isMine && open && outstanding > 0 && (
          <MoneyForm
            title={`Declare unused funds returned · ${formatNaira(Math.max(unaccounted, 0))} unaccounted`}
            submitLabel="Declare refund" defaultAmount={Math.max(unaccounted, 0)} withEvidence busy={declare.isPending}
            onSubmit={async (v) => {
              try {
                await declare.mutateAsync({ id: r.id, amount: v.amount, returnedOn: v.date, method: v.method, reference: v.reference, notes: v.notes, evidence: v.evidence })
                toast.success('Refund declared', { description: 'Finance will confirm once the money is received. Until then it doesn’t reduce your balance.' })
                return true
              } catch (err) { toast.error('Could not declare refund', { description: errorMessage(err) }); return false }
            }}
          />
        )}
        {canVerify && open && unaccounted > 0 && (
          <MoneyForm
            title="Record money received (no declaration)"
            submitLabel="Record & confirm refund" defaultAmount={unaccounted} busy={record.isPending}
            onSubmit={async (v) => {
              try {
                await record.mutateAsync({ id: r.id, amount: v.amount, receivedOn: v.date, method: v.method, reference: v.reference, notes: v.notes })
                toast.success('Refund recorded')
                return true
              } catch (err) { toast.error('Could not record refund', { description: errorMessage(err) }); return false }
            }}
          />
        )}
        {canVerify && open && outstanding < 0 && (
          <MoneyForm
            title={`Approve and reimburse additional expenditure · ${formatNaira(-outstanding)} verified above the advance`}
            submitLabel="Record reimbursement" defaultAmount={-outstanding} busy={reimburse.isPending}
            onSubmit={async (v) => {
              try {
                await reimburse.mutateAsync({ id: r.id, amount: v.amount, paidOn: v.date, method: v.method, reference: v.reference, notes: v.notes })
                toast.success('Reimbursement recorded')
                return true
              } catch (err) { toast.error('Could not record reimbursement', { description: errorMessage(err) }); return false }
            }}
          />
        )}
      </div>
    </section>
  )
}

// ---- E. Audit history -----------------------------------------------------
export function AuditHistory({ requestId }: { requestId: string }) {
  const { data = [], isLoading } = useFundRequestHistory(requestId)
  return (
    <section>
      <Heading title="Audit history" />
      {isLoading ? <Skeleton className="h-20 w-full" /> : data.length === 0 ? <p className="text-sm text-muted-foreground">No history yet.</p> : (
        <ol className="space-y-2 border-l border-border pl-4">
          {data.map((h) => (
            <li key={h.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary/60" aria-hidden />
              <p>{h.summary ?? h.action}</p>
              <p className="text-xs text-muted-foreground">{h.actor_name ?? 'System'} · {format(new Date(h.created_at), 'MMM d, yyyy h:mm a')}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** Retirement status, deadline (finance can move it) and, for the employee,
 * how much they still have to account for. Shown above the money tabs. */
export function RetirementStatusBar({ r }: { r: FundRequest }) {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const isMine = r.user_id === userId
  const canVerify = has('funds.manage') && !isMine
  const setDue = useSetRetirementDueDate(activeOrgId)
  const [due, setDueValue] = React.useState(r.retirement_due_date ?? '')
  React.useEffect(() => setDueValue(r.retirement_due_date ?? ''), [r.retirement_due_date])
  const rst = RETIREMENT_STATUS_META[r.retirement_status ?? 'not_started'] ?? RETIREMENT_STATUS_META.not_started
  const overdue = isRetirementOverdue(r) && outstandingBalance(r) > 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Retirement</span>
        <Badge variant={rst.variant}>{rst.label}</Badge>
        {overdue && <Badge variant="destructive">Overdue</Badge>}
        {r.retirement_due_date && <span className="text-xs text-muted-foreground">Due {format(new Date(r.retirement_due_date), 'MMM d, yyyy')}</span>}
        {r.last_retirement_at && <span className="text-xs text-muted-foreground">· last activity {format(new Date(r.last_retirement_at), 'MMM d')}</span>}
      </div>
      {canVerify && OPEN_ADVANCE_STATUSES.includes(r.status) && (
        <div className="flex items-center gap-2">
          <Input type="date" className="h-8 w-[150px]" value={due} onChange={(e) => setDueValue(e.target.value)} aria-label="Retirement deadline" />
          <Button
            size="sm" variant="ghost" disabled={!due || due === r.retirement_due_date} loading={setDue.isPending}
            onClick={async () => {
              try { await setDue.mutateAsync({ id: r.id, due }); toast.success('Deadline updated') }
              catch (err) { toast.error('Could not update deadline', { description: errorMessage(err) }) }
            }}
          >
            Set deadline
          </Button>
        </div>
      )}
    </div>
  )
}

/** Finance closes a fully reconciled advance. */
export function CloseRetirementBox({ r }: { r: FundRequest }) {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const close = useCloseRetirement(activeOrgId)
  if (!has('funds.manage') || r.user_id === userId || r.status !== 'retired') return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success/40 bg-success/10 p-3">
      <p className="text-sm">Fully reconciled: every expense verified, every refund confirmed, nothing outstanding.</p>
      <Button
        size="sm" loading={close.isPending}
        onClick={async () => {
          try { await close.mutateAsync({ id: r.id }); toast.success('Advance closed') }
          catch (err) { toast.error('Could not close', { description: errorMessage(err) }) }
        }}
      >
        Close retirement
      </Button>
    </div>
  )
}
