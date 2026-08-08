import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileText } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useStaffProfiles } from '@/features/staff/hooks/use-staff'
import {
  useAddTimeEntry,
  useUpdateTimeEntry,
  useAddExpense,
  useUpdateExpense,
  useUploadReceipt,
  useReplaceReceipt,
  useRemoveReceipt,
} from '@/features/billing/hooks/use-billing'
import { billingService } from '@/features/billing/services/billing.service'
import { timeEntrySchema, type TimeEntryFormValues } from '@/features/billing/schemas'
import {
  EXPENSE_CATEGORIES,
  TIME_ENTRY_STATUS_META,
  LOCKED_TIME_ENTRY_STATUSES,
  type ExpenseRow,
  type TimeEntryRow,
} from '@/features/billing/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'

const RECEIPT_ACCEPT = '.pdf,.jpg,.jpeg,.png'
const RECEIPT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

const NONE = '__none__'
const today = () => new Date().toISOString().slice(0, 10)

function MatterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { activeOrgId } = useAuth()
  const { data: matters } = useMatters(activeOrgId, {})
  return (
    <Select value={value || NONE} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="No matter" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No matter</SelectItem>
        {matters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function BillableCheck({ checked, onChange }: { checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
      Billable to client
    </label>
  )
}

function toTimeDefaults(entry?: TimeEntryRow | null, duplicateFrom?: TimeEntryRow | null, myRate = 0): TimeEntryFormValues {
  const source = entry ?? duplicateFrom
  const editableStatus =
    entry && (entry.status === 'draft' || entry.status === 'submitted' || entry.status === 'approved') ? entry.status : 'draft'
  return {
    matterId: source?.matter_id ?? '',
    workDate: source?.work_date ?? today(),
    hours: source ? source.minutes / 60 : 0,
    rate: source ? Number(source.rate) : myRate,
    description: source?.description ?? '',
    billable: source?.billable ?? true,
    status: editableStatus,
  }
}

export function TimeEntryDialog({
  entry,
  duplicateFrom,
  open,
  onOpenChange,
}: {
  entry?: TimeEntryRow | null
  duplicateFrom?: TimeEntryRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile, activeMembership } = useAuth()
  const { data: staff } = useStaffProfiles(activeOrgId)
  const myRate = staff?.find((s) => s.user_id === profile?.id)?.hourly_rate ?? 0
  const create = useAddTimeEntry(activeOrgId, profile?.id ?? null)
  const update = useUpdateTimeEntry(activeOrgId)

  const isPartner = (activeMembership?.role.rank ?? 999) <= 20
  const locked = entry ? LOCKED_TIME_ENTRY_STATUSES.includes(entry.status) : false

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: toTimeDefaults(entry, duplicateFrom, myRate),
  })
  React.useEffect(() => {
    if (open) form.reset(toTimeDefaults(entry, duplicateFrom, myRate))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry, duplicateFrom])

  const onSubmit = async (values: TimeEntryFormValues) => {
    const clean = { ...values, matterId: values.matterId === NONE ? '' : values.matterId }
    try {
      if (entry) await update.mutateAsync({ id: entry.id, values: clean })
      else await create.mutateAsync(clean)
      toast.success(entry ? 'Time entry updated' : 'Time logged')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save time entry', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const title = entry ? 'Edit time entry' : duplicateFrom ? 'Duplicate time entry' : 'Log time'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Record billable (or non-billable) hours against a matter.</DialogDescription>
        </DialogHeader>

        {locked && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            {isPartner
              ? 'This entry has been invoiced — use Reopen from the table to unlock it before editing.'
              : 'This entry has been invoiced and is locked. Ask a partner to reopen it before editing.'}
          </p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
              <FormField
                control={form.control}
                name="matterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter</FormLabel>
                    <MatterSelect value={field.value ?? ''} onChange={field.onChange} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="workDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hours"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours</FormLabel>
                      <FormControl><Input type="number" step="0.25" placeholder="1.5" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rate (₦/hr)</FormLabel>
                      <FormControl><Input type="number" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Input placeholder="Drafted response to motion" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(['draft', 'submitted', 'approved'] as const).map((s) => (
                          <SelectItem key={s} value={s}>{TIME_ENTRY_STATUS_META[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="billable"
                render={({ field }) => (
                  <FormItem>
                    <BillableCheck checked={field.value} onChange={field.onChange} />
                  </FormItem>
                )}
              />
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" loading={create.isPending || update.isPending} disabled={locked}>
                {entry ? 'Save changes' : 'Log time'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export function ExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense?: ExpenseRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const add = useAddExpense(activeOrgId, profile?.id ?? null)
  const update = useUpdateExpense(activeOrgId)
  const uploadReceipt = useUploadReceipt(activeOrgId, profile?.id ?? null)
  const replaceReceipt = useReplaceReceipt(activeOrgId, profile?.id ?? null)
  const removeReceipt = useRemoveReceipt(activeOrgId)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const invoiced = expense?.invoiced ?? false
  const loggedByName = expense?.created_by_profile?.full_name ?? expense?.user?.full_name ?? null
  const receipt = expense?.receipts?.[0] ?? null

  const [matterId, setMatterId] = React.useState('')
  const [expenseDate, setExpenseDate] = React.useState(today())
  const [amount, setAmount] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [billable, setBillable] = React.useState(true)

  React.useEffect(() => {
    if (open) {
      setMatterId(expense?.matter_id ?? '')
      setExpenseDate(expense?.expense_date ?? today())
      setAmount(expense ? String(expense.amount) : '')
      setCategory(expense?.category ?? '')
      setDescription(expense?.description ?? '')
      setBillable(expense?.billable ?? true)
    }
  }, [open, expense])

  const submit = async () => {
    if (invoiced) return
    if (!Number(amount) || !description.trim()) {
      toast.error('Enter an amount and a description')
      return
    }
    if (billable && (!matterId || matterId === NONE)) {
      toast.error('Billable expenses must be linked to a matter', {
        description: "Pick a matter, or untick 'Billable to client' for firm overheads.",
      })
      return
    }
    const values = {
      matterId: matterId === NONE ? '' : matterId,
      expenseDate,
      amount: Number(amount),
      category: category === NONE ? '' : category,
      description,
      billable,
    }
    try {
      if (expense) await update.mutateAsync({ id: expense.id, values, invoiced })
      else await add.mutateAsync(values)
      toast.success(expense ? 'Expense updated' : 'Expense logged')
      onOpenChange(false)
    } catch (err) {
      toast.error(expense ? 'Could not update expense' : 'Could not log expense', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const openReceipt = async (mode: 'view' | 'download') => {
    if (!receipt) return
    try {
      const url = await billingService.receiptSignedUrl(receipt.storage_path)
      if (mode === 'view') {
        window.open(url, '_blank', 'noopener')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = receipt.file_name
        a.click()
      }
    } catch (err) {
      toast.error('Could not open receipt', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const onFileSelected = async (file?: File) => {
    if (!file || !expense) return
    if (!RECEIPT_MIME_TYPES.includes(file.type)) {
      toast.error('Receipts must be a PDF, JPG or PNG')
      return
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      toast.error('Receipt is too large', { description: 'Maximum size is 10MB.' })
      return
    }
    try {
      if (receipt) {
        await replaceReceipt.mutateAsync({ expenseId: expense.id, matterId: expense.matter_id, file, oldReceipt: receipt })
        toast.success('Receipt replaced')
      } else {
        await uploadReceipt.mutateAsync({ expenseId: expense.id, matterId: expense.matter_id, file })
        toast.success('Receipt uploaded')
      }
    } catch (err) {
      toast.error('Could not save receipt', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const onRemoveReceipt = async () => {
    if (!receipt) return
    try {
      await removeReceipt.mutateAsync(receipt)
      toast.success('Receipt removed')
    } catch (err) {
      toast.error('Could not remove receipt', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit expense' : 'Log expense'}</DialogTitle>
          <DialogDescription>Record a disbursement against a matter.</DialogDescription>
        </DialogHeader>

        {invoiced && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            This expense has been invoiced and can no longer be edited.
            {expense?.invoice?.invoice_number && <> Included in Invoice {expense.invoice.invoice_number}.</>}
          </p>
        )}

        <fieldset disabled={invoiced} className="space-y-4 disabled:opacity-60">
          <div className="space-y-1.5">
            <Label>Matter</Label>
            <MatterSelect value={matterId} onChange={setMatterId} />
            {billable && (!matterId || matterId === NONE) && (
              <p className="text-xs text-warning">Billable expenses need a matter so they can reach an invoice.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Amount (₦)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category || NONE} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorised</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Court filing fee" /></div>
          <BillableCheck checked={billable} onChange={setBillable} />
        </fieldset>

        {loggedByName && (
          <p className="text-xs text-muted-foreground">
            Logged by <span className="font-medium text-foreground">{loggedByName}</span>
          </p>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <Label>Receipt</Label>
          {!expense ? (
            <p className="text-xs text-muted-foreground">You can attach a receipt once the expense is saved.</p>
          ) : receipt ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{receipt.file_name}</span>
              </span>
              <div className="flex shrink-0 gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => openReceipt('view')}>View</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => openReceipt('download')}>Download</Button>
                {!invoiced && (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()} loading={replaceReceipt.isPending}>
                      Replace
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={onRemoveReceipt} loading={removeReceipt.isPending}>
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : !invoiced ? (
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={uploadReceipt.isPending}>
              Upload receipt
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">No receipt was attached.</p>
          )}
          {expense && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={RECEIPT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  void onFileSelected(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <p className="text-xs text-muted-foreground">PDF, JPG or PNG, up to 10MB.</p>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!invoiced && (
            <Button onClick={submit} loading={add.isPending || update.isPending}>
              {expense ? 'Save changes' : 'Log expense'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
