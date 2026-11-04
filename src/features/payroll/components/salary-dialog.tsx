import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePayrollRates, useSaveSalary } from '@/features/payroll/hooks/use-payroll'
import { computePayslip, DEFAULT_PAYROLL_RATES } from '@/features/payroll/lib/payroll-calc'
import { EMPTY_SALARY, type PayrollEmployee, type SalaryPatch } from '@/features/payroll/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'

type NumKey = 'basic' | 'housing' | 'transport' | 'other_allowances' | 'annual_rent' | 'other_deductions'
type TextKey = 'other_deductions_note' | 'bank_name' | 'account_number' | 'account_name' | 'tax_id' | 'pension_pin' | 'pension_administrator'

function toForm(s: SalaryPatch) {
  return {
    ...s,
    basic: String(s.basic), housing: String(s.housing), transport: String(s.transport),
    other_allowances: String(s.other_allowances), annual_rent: String(s.annual_rent), other_deductions: String(s.other_deductions),
  }
}

export function SalaryDialog({ person, onOpenChange }: { person: PayrollEmployee | null; onOpenChange: (open: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const { data: rates } = usePayrollRates(activeOrgId)
  const save = useSaveSalary(activeOrgId)
  const [form, setForm] = React.useState(() => toForm(EMPTY_SALARY))

  React.useEffect(() => {
    if (!person) return
    const { organization_id: _o, user_id: _u, updated_by: _b, updated_at: _a, ...rest } = person.salary ?? { ...EMPTY_SALARY, organization_id: '', user_id: '', updated_by: null, updated_at: '' }
    setForm(toForm(rest))
  }, [person])

  const num = (k: NumKey) => Math.max(0, Number(form[k]) || 0)
  const preview = computePayslip({
    basic: num('basic'), housing: num('housing'), transport: num('transport'), other_allowances: num('other_allowances'),
    annual_rent: num('annual_rent'), pension_enabled: form.pension_enabled, nhf_enabled: form.nhf_enabled, other_deductions: num('other_deductions'),
  }, rates ?? DEFAULT_PAYROLL_RATES)

  const setNum = (k: NumKey) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setText = (k: TextKey) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const onSave = async () => {
    if (!person) return
    const blank = (v: string | null) => (v && v.trim() ? v.trim() : null)
    const patch: SalaryPatch = {
      on_payroll: form.on_payroll,
      pension_enabled: form.pension_enabled,
      nhf_enabled: form.nhf_enabled,
      basic: num('basic'), housing: num('housing'), transport: num('transport'), other_allowances: num('other_allowances'),
      annual_rent: num('annual_rent'), other_deductions: num('other_deductions'),
      other_deductions_note: blank(form.other_deductions_note),
      bank_name: blank(form.bank_name), account_number: blank(form.account_number), account_name: blank(form.account_name),
      tax_id: blank(form.tax_id), pension_pin: blank(form.pension_pin), pension_administrator: blank(form.pension_administrator),
    }
    try {
      await save.mutateAsync({ employeeId: person.employee.userId, patch })
      toast.success('Salary saved')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save salary', { description: errorMessage(err) })
    }
  }

  const money = (label: string, k: NumKey, hint?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} step="0.01" inputMode="decimal" value={form[k]} onChange={setNum(k)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
  const text = (label: string, k: TextKey) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={form[k] ?? ''} onChange={setText(k)} />
    </div>
  )
  const check = (label: string, k: 'on_payroll' | 'pension_enabled' | 'nhf_enabled') => (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
      {label}
    </label>
  )

  return (
    <Dialog open={Boolean(person)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Salary — {person?.employee.fullName ?? person?.employee.email}</DialogTitle>
          <DialogDescription>Monthly amounts. Deductions are worked out automatically from your payroll settings.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-5">
            {check('On payroll', 'on_payroll')}
            {check('Pension (8% / 10%)', 'pension_enabled')}
            {check('National Housing Fund', 'nhf_enabled')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {money('Basic salary', 'basic')}
            {money('Housing allowance', 'housing')}
            {money('Transport allowance', 'transport')}
            {money('Other allowances', 'other_allowances')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {money('Annual rent paid (for rent relief)', 'annual_rent', 'Optional — 20% of this, up to ₦500,000, is tax-free.')}
            {money('Other monthly deductions', 'other_deductions', 'e.g. staff loan repayment')}
            {text('Deduction note', 'other_deductions_note')}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {text('Bank', 'bank_name')}
            {text('Account number', 'account_number')}
            {text('Account name', 'account_name')}
            {text('Tax ID (TIN)', 'tax_id')}
            {text('Pension PIN', 'pension_pin')}
            {text('Pension administrator (PFA)', 'pension_administrator')}
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Gross</p><p className="font-medium tabular-nums">{formatNaira(preview.gross)}</p></div>
            <div><p className="text-xs text-muted-foreground">PAYE</p><p className="font-medium tabular-nums">{formatNaira(preview.paye)}</p></div>
            <div><p className="text-xs text-muted-foreground">Pension (employee)</p><p className="font-medium tabular-nums">{formatNaira(preview.pension_employee)}</p></div>
            <div><p className="text-xs text-muted-foreground">NHF</p><p className="font-medium tabular-nums">{formatNaira(preview.nhf)}</p></div>
            <div><p className="text-xs text-muted-foreground">Other deductions</p><p className="font-medium tabular-nums">{formatNaira(preview.other_deductions)}</p></div>
            <div><p className="text-xs text-muted-foreground">Net pay</p><p className="font-display text-base font-semibold tabular-nums">{formatNaira(preview.net)}</p></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} loading={save.isPending}>Save salary</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
