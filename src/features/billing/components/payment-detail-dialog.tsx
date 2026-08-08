import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Download, Pencil, Printer, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePayment, useUpdatePayment, useVoidPayment } from '@/features/billing/hooks/use-billing'
import { printReceipt } from '@/features/billing/lib/print-receipt'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { Separator } from '@/shared/components/ui/separator'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatNaira } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const NONE = '__none__'
const PAYMENT_METHODS = ['Bank transfer', 'Card', 'Cash', 'Cheque']

/** View a payment, its receipt actions, and — Managing Partner only — edit/void it with a full audit trail. */
export function PaymentDetailDialog({
  paymentId,
  open,
  onOpenChange,
  onViewInvoice,
}: {
  paymentId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Opens the linked InvoiceDetailDialog — owned by the caller, which already has one. */
  onViewInvoice: (invoiceId: string) => void
}) {
  const { activeOrgId, activeMembership } = useAuth()
  const { has } = usePermissions()
  const canVoid = has('payments.void')
  const { data: payment, isLoading } = usePayment(paymentId ?? undefined)
  const update = useUpdatePayment(activeOrgId)
  const voidPayment = useVoidPayment(activeOrgId)

  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [amount, setAmount] = React.useState('')
  const [method, setMethod] = React.useState('')
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [paidAt, setPaidAt] = React.useState('')

  React.useEffect(() => {
    if (payment && editing) {
      setAmount(String(payment.amount))
      setMethod(payment.method ?? '')
      setReference(payment.reference ?? '')
      setNotes(payment.notes ?? '')
      setPaidAt(payment.paid_at)
    }
  }, [payment, editing])

  const org = activeMembership?.organization

  const printOrDownload = () => {
    if (!payment || !org) return
    printReceipt(payment, org)
  }

  const saveEdit = async () => {
    if (!payment || !Number(amount)) {
      toast.error('Enter an amount')
      return
    }
    try {
      await update.mutateAsync({
        id: payment.id,
        invoiceId: payment.invoice_id,
        values: { amount: Number(amount), method: method || undefined, reference: reference || undefined, notes: notes || undefined, paidAt },
      })
      toast.success('Payment updated')
      setEditing(false)
    } catch (err) {
      toast.error('Could not update payment', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const confirmVoid = async () => {
    if (!payment) return
    try {
      await voidPayment.mutateAsync({ id: payment.id, invoiceId: payment.invoice_id, paymentNumber: payment.payment_number ?? payment.id })
      toast.success('Payment deleted')
      setConfirmDelete(false)
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not delete payment', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setEditing(false) }}>
      <DialogContent className="max-w-lg">
        {isLoading || !payment ? (
          <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {payment.payment_number}
                <Badge variant="secondary">{payment.receipt_number}</Badge>
              </DialogTitle>
              <DialogDescription>
                {payment.client?.display_name}
                {payment.matter && <> · {payment.matter.matter_number} — {payment.matter.title}</>}
              </DialogDescription>
            </DialogHeader>

            {editing ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Method</Label>
                    <Select value={method || NONE} onValueChange={(v) => setMethod(v === NONE ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>—</SelectItem>
                        {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span>
                  <button className="text-primary hover:underline" onClick={() => onViewInvoice(payment.invoice_id)}>{payment.invoice?.invoice_number}</button>
                </div>
                {payment.matter && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Matter</span>
                    <Link to={`/matters/${payment.matter.id}`} className="text-primary hover:underline">{payment.matter.matter_number}</Link>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatNaira(Number(payment.amount))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Payment date</span><span>{format(new Date(payment.paid_at), 'PP')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Method</span><span>{payment.method ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{payment.reference ?? '—'}</span></div>
                {payment.notes && <div className="flex justify-between"><span className="text-muted-foreground">Notes</span><span className="text-right">{payment.notes}</span></div>}
                <Separator className="my-2" />
                <div className="flex justify-between"><span className="text-muted-foreground">Recorded by</span><span>{payment.created_by_profile?.full_name ?? '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Created at</span><span>{format(new Date(payment.created_at), 'PPp')}</span></div>
              </div>
            )}

            <DialogFooter className="sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {canVoid && !editing && (
                  <>
                    <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </>
                )}
                {editing && (
                  <>
                    <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button onClick={saveEdit} loading={update.isPending}>Save changes</Button>
                  </>
                )}
              </div>
              {!editing && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={printOrDownload}><Download className="h-4 w-4" /> Download receipt</Button>
                  <Button onClick={printOrDownload}><Printer className="h-4 w-4" /> Print receipt</Button>
                </div>
              )}
            </DialogFooter>

            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title={`Delete payment ${payment.payment_number}?`}
              destructive
              confirmLabel="Delete"
              loading={voidPayment.isPending}
              description="This recalculates the invoice's balance and status. This cannot be undone, and is recorded in the Activity Timeline."
              onConfirm={confirmVoid}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
