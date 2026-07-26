import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useStaffProfiles } from '@/features/staff/hooks/use-staff'
import { useAddTimeEntry, useAddExpense } from '@/features/billing/hooks/use-billing'
import { EXPENSE_CATEGORIES } from '@/features/billing/types'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'

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

export function TimeEntryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId, profile } = useAuth()
  const { data: staff } = useStaffProfiles(activeOrgId)
  const add = useAddTimeEntry(activeOrgId, profile?.id ?? null)
  const myRate = staff?.find((s) => s.user_id === profile?.id)?.hourly_rate ?? 0

  const [matterId, setMatterId] = React.useState('')
  const [workDate, setWorkDate] = React.useState(today())
  const [hours, setHours] = React.useState('')
  const [rate, setRate] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [billable, setBillable] = React.useState(true)

  React.useEffect(() => {
    if (open) {
      setMatterId(''); setWorkDate(today()); setHours(''); setRate(myRate ? String(myRate) : ''); setDescription(''); setBillable(true)
    }
  }, [open, myRate])

  const submit = async () => {
    if (!Number(hours) || !description.trim()) {
      toast.error('Enter hours and a description')
      return
    }
    if (billable && (!matterId || matterId === NONE)) {
      toast.error('Billable time must be linked to a matter', {
        description: "Pick a matter, or untick 'Billable to client' for internal work.",
      })
      return
    }
    try {
      await add.mutateAsync({
        matterId: matterId === NONE ? '' : matterId,
        workDate,
        hours: Number(hours),
        rate: Number(rate) || 0,
        description,
        billable,
      })
      toast.success('Time logged')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not log time', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
          <DialogDescription>Record billable (or non-billable) hours against a matter.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Matter</Label>
            <MatterSelect value={matterId} onChange={setMatterId} />
            {billable && (!matterId || matterId === NONE) && (
              <p className="text-xs text-warning">Billable time needs a matter so it can reach an invoice.</p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Hours</Label><Input type="number" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="1.5" /></div>
            <div className="space-y-1.5"><Label>Rate (₦/hr)</Label><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Drafted response to motion" /></div>
          <BillableCheck checked={billable} onChange={setBillable} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={add.isPending}>Log time</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId, profile } = useAuth()
  const add = useAddExpense(activeOrgId, profile?.id ?? null)

  const [matterId, setMatterId] = React.useState('')
  const [expenseDate, setExpenseDate] = React.useState(today())
  const [amount, setAmount] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [billable, setBillable] = React.useState(true)

  React.useEffect(() => {
    if (open) { setMatterId(''); setExpenseDate(today()); setAmount(''); setCategory(''); setDescription(''); setBillable(true) }
  }, [open])

  const submit = async () => {
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
    try {
      await add.mutateAsync({
        matterId: matterId === NONE ? '' : matterId,
        expenseDate,
        amount: Number(amount),
        category: category === NONE ? '' : category,
        description,
        billable,
      })
      toast.success('Expense logged')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not log expense', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log expense</DialogTitle>
          <DialogDescription>Record a disbursement against a matter.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={add.isPending}>Log expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
