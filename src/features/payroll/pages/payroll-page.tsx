import * as React from 'react'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  usePayrollRuns, useCreatePayrollRun, usePayrollEmployees, usePayrollRates, useSavePayrollRates,
} from '@/features/payroll/hooks/use-payroll'
import { PayrollRunPanel } from '@/features/payroll/components/payroll-run-panel'
import { SalaryDialog } from '@/features/payroll/components/salary-dialog'
import { DEFAULT_PAYROLL_RATES, type PayrollRates, type TaxBand } from '@/features/payroll/lib/payroll-calc'
import { PAYROLL_STATUS_META, type PayrollEmployee } from '@/features/payroll/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Tab = 'runs' | 'salaries' | 'settings'

function NewRunDialog({ onCreated }: { onCreated: (runId: string) => void }) {
  const { activeOrgId } = useAuth()
  const create = useCreatePayrollRun(activeOrgId)
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(format(new Date(), 'yyyy-MM'))

  const onCreate = async () => {
    if (!/^\d{4}-\d{2}$/.test(month)) { toast.error('Pick a month'); return }
    try {
      const { run, count } = await create.mutateAsync(`${month}-01`)
      toast.success(`Draft payroll created with ${count} payslip${count === 1 ? '' : 's'}`)
      setOpen(false)
      onCreated(run.id)
    } catch (err) {
      toast.error('Could not create payroll', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> Run payroll</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run payroll</DialogTitle>
          <DialogDescription>Creates a draft from everyone's current salary. Nothing is visible to staff until you approve it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Month</Label>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onCreate} loading={create.isPending}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RunsTab() {
  const { activeOrgId } = useAuth()
  const { data: runs = [], isLoading } = usePayrollRuns(activeOrgId)
  const [selected, setSelected] = React.useState<string | null>(null)
  const run = runs.find((r) => r.id === selected)

  if (run) return <PayrollRunPanel run={run} onBack={() => setSelected(null)} />

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><NewRunDialog onCreated={setSelected} /></div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : runs.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No payrolls yet. Set salaries on the Salaries tab, then run your first payroll.</p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.map((r) => {
              const meta = PAYROLL_STATUS_META[r.status]
              return (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/40">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(r.period + 'T00:00:00'), 'MMMM yyyy')}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.status === 'draft' ? 'Draft — open to review' : `${r.employee_count} employees · net ${formatNaira(Number(r.total_net))}`}
                        {r.paid_at ? ` · paid ${format(new Date(r.paid_at), 'MMM d, yyyy')}` : ''}
                      </p>
                    </div>
                    <Badge variant={meta?.variant}>{meta?.label ?? r.status}</Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}

function SalariesTab() {
  const { activeOrgId } = useAuth()
  const { data: people = [], isLoading } = usePayrollEmployees(activeOrgId)
  const [editing, setEditing] = React.useState<PayrollEmployee | null>(null)
  const monthlyGross = (p: PayrollEmployee) =>
    p.salary ? Number(p.salary.basic) + Number(p.salary.housing) + Number(p.salary.transport) + Number(p.salary.other_allowances) : 0
  const onPayroll = people.filter((p) => p.salary?.on_payroll && monthlyGross(p) > 0)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {onPayroll.length} of {people.length} employees on payroll · monthly gross {formatNaira(onPayroll.reduce((s, p) => s + monthlyGross(p), 0))}
      </p>
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 text-right font-medium">Basic</th>
                  <th className="px-4 py-2 text-right font-medium">Allowances</th>
                  <th className="px-4 py-2 text-right font-medium">Monthly gross</th>
                  <th className="px-4 py-2 font-medium">Bank</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const s = p.salary
                  const allowances = s ? Number(s.housing) + Number(s.transport) + Number(s.other_allowances) : 0
                  return (
                    <tr key={p.employee.userId} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">
                        <p className="font-medium">{p.employee.fullName ?? p.employee.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.employee.jobTitleName ?? p.employee.roleName ?? '—'}
                          {s && !s.on_payroll ? ' · not on payroll' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{s ? formatNaira(Number(s.basic)) : '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s ? formatNaira(allowances) : '—'}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{s ? formatNaira(monthlyGross(p)) : '—'}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{s?.bank_name ? `${s.bank_name} · ${s.account_number ?? ''}` : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="outline" size="sm" onClick={() => setEditing(p)}>{s ? 'Edit' : 'Set salary'}</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <SalaryDialog person={editing} onOpenChange={(o) => { if (!o) setEditing(null) }} />
    </div>
  )
}

function SettingsTab() {
  const { activeOrgId } = useAuth()
  const { data: rates, isLoading } = usePayrollRates(activeOrgId)
  const save = useSavePayrollRates(activeOrgId)
  const [form, setForm] = React.useState<PayrollRates>(DEFAULT_PAYROLL_RATES)
  React.useEffect(() => { if (rates) setForm(rates) }, [rates])

  const setRate = (k: Exclude<keyof PayrollRates, 'tax_bands'>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }))
  const setBand = (i: number, patch: Partial<TaxBand>) =>
    setForm((f) => ({ ...f, tax_bands: f.tax_bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }))

  const onSave = async () => {
    const bands = form.tax_bands
    const ascending = bands.every((b, i) => i === 0 || (b.upto ?? Infinity) > (bands[i - 1].upto ?? Infinity))
    if (!ascending || bands.slice(0, -1).some((b) => b.upto == null) || bands[bands.length - 1]?.upto != null) {
      toast.error('Tax bands must go up in order, with only the last band open-ended')
      return
    }
    try {
      await save.mutateAsync(form)
      toast.success('Payroll settings saved', { description: 'Draft payrolls pick these up when you Recalculate.' })
    } catch (err) {
      toast.error('Could not save settings', { description: errorMessage(err) })
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full max-w-3xl" />

  const field = (label: string, k: Exclude<keyof PayrollRates, 'tax_bands'>, suffix: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="number" min={0} step="0.01" value={form[k]} onChange={setRate(k)} />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="space-y-5 p-6">
        <div>
          <p className="font-display text-base font-semibold">Statutory rates</p>
          <p className="text-xs text-muted-foreground">Pre-filled with the Nigeria Tax Act 2025, Pension Reform Act 2014 and NHF rates. Confirm with your tax adviser before your first run.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field('Pension — employee', 'pension_employee_rate', '%')}
          {field('Pension — employer', 'pension_employer_rate', '%')}
          {field('NHF (of basic)', 'nhf_rate', '%')}
          {field('Rent relief', 'rent_relief_rate', '% of rent')}
          {field('Rent relief cap', 'rent_relief_cap', '₦ / year')}
          {field('Minimum wage (PAYE-exempt)', 'minimum_wage_monthly', '₦ / month')}
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <p className="font-display text-base font-semibold">PAYE bands (annual taxable income)</p>
          <p className="text-xs text-muted-foreground">Each band is taxed at its rate on the slice of income that falls inside it.</p>
        </div>
        <div className="space-y-2">
          {form.tax_bands.map((b, i) => {
            const from = i === 0 ? 0 : form.tax_bands[i - 1].upto ?? 0
            const last = i === form.tax_bands.length - 1
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_110px_40px] items-center gap-2 text-sm">
                <span className="text-muted-foreground">From {formatNaira(from)}</span>
                {last ? (
                  <span className="text-muted-foreground">and above</span>
                ) : (
                  <Input type="number" min={0} value={b.upto ?? ''} onChange={(e) => setBand(i, { upto: Number(e.target.value) })} aria-label="Band upper limit" />
                )}
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} step="0.5" value={b.rate} onChange={(e) => setBand(i, { rate: Number(e.target.value) })} aria-label="Band rate" />
                  <span className="text-muted-foreground">%</span>
                </div>
                {!last && form.tax_bands.length > 2 ? (
                  <Button variant="ghost" size="sm" aria-label="Remove band" onClick={() => setForm((f) => ({ ...f, tax_bands: f.tax_bands.filter((_, j) => j !== i) }))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : <span />}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => setForm((f) => {
              const bands = [...f.tax_bands]
              const prev = bands.length > 1 ? bands[bands.length - 2].upto ?? 0 : 0
              bands.splice(bands.length - 1, 0, { upto: prev + 1_000_000, rate: bands[bands.length - 1]?.rate ?? 0 })
              return { ...f, tax_bands: bands }
            })}
          >
            <Plus className="h-4 w-4" /> Add band
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setForm(DEFAULT_PAYROLL_RATES)}>Reset to Nigeria Tax Act 2025 defaults</Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} loading={save.isPending}>Save payroll settings</Button>
      </div>
    </div>
  )
}

export function PayrollPage() {
  const [tab, setTab] = React.useState<Tab>('runs')
  return (
    <div>
      <PageHeader title="Payroll" description="Salaries, monthly payroll, PAYE, pension and NHF — with payslips for every employee." />
      <div className="mb-4 flex w-fit rounded-lg border border-border p-0.5">
        {([['runs', 'Payroll runs'], ['salaries', 'Salaries'], ['settings', 'Settings']] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'runs' && <RunsTab />}
      {tab === 'salaries' && <SalariesTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}
