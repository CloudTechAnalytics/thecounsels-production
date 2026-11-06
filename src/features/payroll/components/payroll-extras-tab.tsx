import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, format, startOfMonth } from 'date-fns'
import { Gift, HandCoins, Plus, Trash2, Ban } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { supabase } from '@/shared/lib/supabase'
import type { Database } from '@/shared/types/database.types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'

type Adjustment = Database['public']['Tables']['payroll_adjustments']['Row']
type Loan = Database['public']['Tables']['staff_loans']['Row']
const KIND_LABEL: Record<Adjustment['kind'], string> = { bonus: 'Bonus', overtime: 'Overtime', allowance: 'Allowance', deduction: 'Deduction' }
const monthOptions = () => Array.from({ length: 8 }, (_, i) => startOfMonth(addMonths(new Date(), i - 2)))
const iso = (d: Date) => format(d, 'yyyy-MM-01')

function useExtras(org: string | null) {
  return useQuery({
    queryKey: ['payroll', org, 'extras'],
    enabled: Boolean(org),
    queryFn: async () => {
      const [a, l, r] = await Promise.all([
        supabase.from('payroll_adjustments').select('*').eq('organization_id', org!).order('period', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('staff_loans').select('*').eq('organization_id', org!).order('created_at', { ascending: false }),
        supabase.from('loan_repayments').select('loan_id, amount').eq('organization_id', org!),
      ])
      if (a.error) throw a.error
      if (l.error) throw l.error
      if (r.error) throw r.error
      const repaid = new Map<string, number>()
      for (const x of r.data ?? []) repaid.set(x.loan_id, (repaid.get(x.loan_id) ?? 0) + Number(x.amount))
      return { adjustments: (a.data ?? []) as Adjustment[], loans: (l.data ?? []) as Loan[], repaid }
    },
  })
}

/** Bonuses and other one-off pay items per month, and staff loans / salary
 * advances repaid through payroll. Picked up the next time that month's
 * payroll is generated (or regenerated while still a draft). */
export function PayrollExtrasTab() {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  const { data: register = [] } = useEmployeeRegister(activeOrgId)
  const { data, isLoading } = useExtras(activeOrgId)
  const staff = register.filter((e) => !['resigned', 'terminated', 'former_employee'].includes(e.employment_status))
  const nameOf = (id: string) => register.find((e) => e.id === id)?.fullName ?? 'Staff member'
  const invalidate = () => qc.invalidateQueries({ queryKey: ['payroll'] })
  const months = monthOptions()

  // one-off item form
  const [emp, setEmp] = React.useState('')
  const [month, setMonth] = React.useState(iso(startOfMonth(new Date())))
  const [kind, setKind] = React.useState<Adjustment['kind']>('bonus')
  const [label, setLabel] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [taxable, setTaxable] = React.useState(true)
  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('payroll_adjustments').insert({
        organization_id: activeOrgId!, employee_id: emp, period: month, kind, label: label.trim() || KIND_LABEL[kind], amount: Number(amount), taxable: kind === 'deduction' ? true : taxable,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setLabel(''); setAmount(''); toast.success('Added — regenerate that month’s payroll if it’s already drafted') },
    onError: (e) => toast.error('Could not add', { description: errorMessage(e) }),
  })
  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payroll_adjustments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (e) => toast.error('Could not remove', { description: errorMessage(e) }),
  })

  // loan form
  const [lEmp, setLEmp] = React.useState('')
  const [lKind, setLKind] = React.useState<Loan['kind']>('loan')
  const [principal, setPrincipal] = React.useState('')
  const [installment, setInstallment] = React.useState('')
  const [start, setStart] = React.useState(iso(startOfMonth(new Date())))
  const [reason, setReason] = React.useState('')
  const addLoan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('staff_loans').insert({
        organization_id: activeOrgId!, employee_id: lEmp, kind: lKind, principal: Number(principal), monthly_installment: Number(installment), start_period: start, reason: reason.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setPrincipal(''); setInstallment(''); setReason(''); toast.success('Recorded — it will be deducted from payroll from ' + format(new Date(start + 'T00:00:00'), 'MMMM yyyy')) },
    onError: (e) => toast.error('Could not record', { description: errorMessage(e) }),
  })
  const cancelLoan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('staff_loans').update({ status: 'cancelled' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Stopped — no further deductions') },
  })

  const submitItem = () => {
    if (!emp) { toast.error('Choose a staff member'); return }
    if (!(Number(amount) > 0)) { toast.error('Enter an amount'); return }
    addItem.mutate()
  }
  const submitLoan = () => {
    if (!lEmp) { toast.error('Choose a staff member'); return }
    if (!(Number(principal) > 0) || !(Number(installment) > 0)) { toast.error('Enter the amount and the monthly repayment'); return }
    if (Number(installment) > Number(principal)) { toast.error('The monthly repayment can’t be more than the amount'); return }
    addLoan.mutate()
  }
  const months_ = (l: Loan) => Math.ceil(Number(l.principal) / Number(l.monthly_installment))

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div>
          <p className="flex items-center gap-2 font-display text-base font-semibold"><Gift className="h-4 w-4 text-primary" /> Bonuses & one-off items</p>
          <p className="text-xs text-muted-foreground">Paid or deducted in one month only. A taxable bonus is taxed on the extra tax it actually causes, all in that month.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Staff member</Label>
            <Select value={emp} onValueChange={setEmp}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{staff.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Month</Label>
            <Select value={month} onValueChange={setMonth}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{months.map((m) => <SelectItem key={iso(m)} value={iso(m)}>{format(m, 'MMMM yyyy')}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Adjustment['kind'])}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(KIND_LABEL) as Adjustment['kind'][]).map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description on the payslip</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={kind === 'deduction' ? 'e.g. Damaged laptop charger' : 'e.g. Year-end bonus'} /></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {kind !== 'deduction' ? (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} /> Taxable (PAYE)</label>
          ) : <span />}
          <Button onClick={submitItem} loading={addItem.isPending}><Plus className="h-4 w-4" /> Add</Button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {isLoading ? null : (data?.adjustments ?? []).length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">Nothing added yet.</li> : (data?.adjustments ?? []).slice(0, 40).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{nameOf(a.employee_id)} · {a.label}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(a.period + 'T00:00:00'), 'MMMM yyyy')} · {KIND_LABEL[a.kind]}{a.kind !== 'deduction' && !a.taxable ? ' · not taxed' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={a.kind === 'deduction' ? 'tabular-nums text-destructive' : 'tabular-nums'}>{a.kind === 'deduction' ? '−' : '+'}{formatNaira(Number(a.amount))}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Remove" onClick={() => removeItem.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <p className="flex items-center gap-2 font-display text-base font-semibold"><HandCoins className="h-4 w-4 text-primary" /> Staff loans & salary advances</p>
          <p className="text-xs text-muted-foreground">Repaid automatically from each month’s payroll until cleared. The last repayment is only what’s left.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Staff member</Label>
            <Select value={lEmp} onValueChange={setLEmp}><SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{staff.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Type</Label>
            <Select value={lKind} onValueChange={(v) => setLKind(v as Loan['kind'])}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="loan">Staff loan</SelectItem><SelectItem value="salary_advance">Salary advance</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={0} value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Repay per month</Label><Input type="number" min={0} value={installment} onChange={(e) => setInstallment(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>First deduction</Label>
            <Select value={start} onValueChange={setStart}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{months.map((m) => <SelectItem key={iso(m)} value={iso(m)}>{format(m, 'MMMM yyyy')}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        {Number(principal) > 0 && Number(installment) > 0 && (
          <p className="text-xs text-muted-foreground">Repaid over {Math.ceil(Number(principal) / Number(installment))} month{Math.ceil(Number(principal) / Number(installment)) === 1 ? '' : 's'}.</p>
        )}
        <div className="flex justify-end"><Button onClick={submitLoan} loading={addLoan.isPending}><Plus className="h-4 w-4" /> Record</Button></div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {isLoading ? null : (data?.loans ?? []).length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">No loans or advances.</li> : (data?.loans ?? []).map((l) => {
            const repaid = data?.repaid.get(l.id) ?? 0
            const left = Math.max(Number(l.principal) - repaid, 0)
            const pct = Math.min(100, (repaid / Number(l.principal)) * 100)
            const done = left <= 0
            return (
              <li key={l.id} className="space-y-1.5 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{nameOf(l.employee_id)} · {l.kind === 'salary_advance' ? 'Salary advance' : 'Loan'} {formatNaira(Number(l.principal))}</p>
                  <div className="flex items-center gap-2">
                    {l.status === 'cancelled' ? <Badge variant="muted">Stopped</Badge> : done ? <Badge variant="success">Repaid</Badge> : <Badge variant="default">{formatNaira(left)} left</Badge>}
                    {l.status === 'active' && !done && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Stop deductions" onClick={() => window.confirm('Stop deducting this from payroll?') && cancelLoan.mutate(l.id)}><Ban className="h-3.5 w-3.5" /></Button>
                    )}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                <p className="text-xs text-muted-foreground">
                  {formatNaira(Number(l.monthly_installment))}/month from {format(new Date(l.start_period + 'T00:00:00'), 'MMM yyyy')} · about {months_(l)} months · {formatNaira(repaid)} repaid{l.reason ? ` · ${l.reason}` : ''}
                </p>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
