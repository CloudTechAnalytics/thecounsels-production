import { format } from 'date-fns'
import { ArrowLeft, Printer } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePayslips, useRecalculatePayrollRun, usePayrollRunAction } from '@/features/payroll/hooks/use-payroll'
import { printPayslip } from '@/features/payroll/lib/print-payslip'
import { PAYROLL_STATUS_META, type PayrollRun, type Payslip } from '@/features/payroll/types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ExportButton } from '@/shared/components/export-button'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'

const monthOf = (period: string) => format(new Date(period + 'T00:00:00'), 'MMMM yyyy')

function totals(slips: Payslip[]) {
  const t = { gross: 0, paye: 0, pension_employee: 0, pension_employer: 0, nhf: 0, other: 0, net: 0 }
  for (const s of slips) {
    t.gross += Number(s.gross); t.paye += Number(s.paye); t.pension_employee += Number(s.pension_employee)
    t.pension_employer += Number(s.pension_employer); t.nhf += Number(s.nhf); t.other += Number(s.other_deductions); t.net += Number(s.net)
  }
  return t
}

export function PayrollRunPanel({ run, onBack }: { run: PayrollRun; onBack: () => void }) {
  const { activeOrgId, activeMembership, userId } = useAuth()
  const { data: slips = [], isLoading } = usePayslips(run.id)
  const recalc = useRecalculatePayrollRun(activeOrgId)
  const action = usePayrollRunAction(activeOrgId)
  const t = totals(slips)
  const month = monthOf(run.period)
  const meta = PAYROLL_STATUS_META[run.status]

  const doAction = async (a: 'approve' | 'paid' | 'reopen' | 'delete', done: string) => {
    try {
      await action.mutateAsync({ runId: run.id, action: a })
      toast.success(done)
      if (a === 'delete') onBack()
    } catch (err) {
      toast.error('Action failed', { description: errorMessage(err) })
    }
  }

  const exportSheets = () => [
    {
      name: 'Payroll',
      rows: slips.map((s) => ({
        Employee: s.employee_name, 'Job title': s.job_title ?? '', Department: s.department ?? '',
        Basic: Number(s.basic), Housing: Number(s.housing), Transport: Number(s.transport), 'Other allowances': Number(s.other_allowances),
        Gross: Number(s.gross), PAYE: Number(s.paye), 'Pension (employee)': Number(s.pension_employee), NHF: Number(s.nhf),
        'Other deductions': Number(s.other_deductions), Net: Number(s.net), 'Pension (employer)': Number(s.pension_employer),
      })),
    },
    {
      name: 'Bank schedule',
      rows: slips.map((s) => ({ 'Account name': s.account_name ?? s.employee_name, Bank: s.bank_name ?? '', 'Account number': s.account_number ?? '', Amount: Number(s.net), Narration: `Salary ${month}` })),
    },
    {
      name: 'PAYE schedule',
      rows: slips.map((s) => ({ Employee: s.employee_name, 'Tax ID': s.tax_id ?? '', 'Gross pay': Number(s.gross), 'PAYE deducted': Number(s.paye) })),
    },
    {
      name: 'Pension schedule',
      rows: slips.filter((s) => Number(s.pension_employee) > 0).map((s) => ({
        Employee: s.employee_name, 'Pension PIN': s.pension_pin ?? '',
        'Employee (8%)': Number(s.pension_employee), 'Employer (10%)': Number(s.pension_employer),
        Total: Number(s.pension_employee) + Number(s.pension_employer),
      })),
    },
    {
      name: 'NHF schedule',
      rows: slips.filter((s) => Number(s.nhf) > 0).map((s) => ({ Employee: s.employee_name, Basic: Number(s.basic), NHF: Number(s.nhf) })),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> All payrolls</Button>
          <p className="font-display text-xl font-semibold">{month}</p>
          <Badge variant={meta?.variant}>{meta?.label ?? run.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton filename={`payroll-${run.period.slice(0, 7)}`} sheets={exportSheets} disabled={slips.length === 0} />
          {run.status === 'draft' && (
            <>
              <Button variant="ghost" size="sm" onClick={() => doAction('delete', 'Draft payroll deleted')} disabled={action.isPending}>Delete draft</Button>
              <Button
                variant="outline" size="sm" loading={recalc.isPending}
                onClick={async () => {
                  try { const n = await recalc.mutateAsync(run.id); toast.success(`Recalculated ${n} payslip${n === 1 ? '' : 's'} from current salaries`) }
                  catch (err) { toast.error('Could not recalculate', { description: errorMessage(err) }) }
                }}
              >
                Recalculate
              </Button>
              {run.created_by === userId ? (
                <span className="self-center text-xs text-muted-foreground">You prepared this — another payroll manager must approve it</span>
              ) : (
                <Button size="sm" onClick={() => doAction('approve', 'Payroll approved — staff can now see their payslips')} loading={action.isPending} disabled={slips.length === 0}>
                  Approve & release payslips
                </Button>
              )}
            </>
          )}
          {run.status === 'approved' && (
            <>
              <Button variant="outline" size="sm" onClick={() => doAction('reopen', 'Payroll reopened as a draft')} disabled={action.isPending}>Reopen</Button>
              <Button size="sm" onClick={() => doAction('paid', 'Payroll marked as paid')} loading={action.isPending}>Mark as paid</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Gross pay', value: t.gross, hint: `${slips.length} employee${slips.length === 1 ? '' : 's'}` },
          { label: 'PAYE to remit', value: t.paye, hint: 'To the State Internal Revenue Service' },
          { label: 'Pension to remit', value: t.pension_employee + t.pension_employer, hint: `${formatNaira(t.pension_employee)} staff + ${formatNaira(t.pension_employer)} firm` },
          { label: 'Net pay', value: t.net, hint: t.nhf ? `NHF ${formatNaira(t.nhf)}` : 'Paid to staff accounts' },
        ].map((k) => (
          <Card key={k.label} className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{formatNaira(k.value)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{k.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : slips.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No payslips — set salaries on the Salaries tab, then Recalculate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 text-right font-medium">Gross</th>
                  <th className="px-4 py-2 text-right font-medium">PAYE</th>
                  <th className="px-4 py-2 text-right font-medium">Pension</th>
                  <th className="px-4 py-2 text-right font-medium">NHF</th>
                  <th className="px-4 py-2 text-right font-medium">Other</th>
                  <th className="px-4 py-2 text-right font-medium">Net</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <p className="font-medium">{s.employee_name}</p>
                      <p className="text-xs text-muted-foreground">{[s.job_title, s.department].filter(Boolean).join(' · ') || '—'}</p>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(s.gross))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(s.paye))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(s.pension_employee))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(s.nhf))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(s.other_deductions))}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatNaira(Number(s.net))}</td>
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost" size="sm" aria-label="Print payslip"
                        onClick={() => activeMembership && printPayslip(s, run.period, activeMembership.organization)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-medium">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(t.gross)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(t.paye)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(t.pension_employee)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(t.nhf)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(t.other)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNaira(t.net)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {run.status === 'draft' && (
        <p className="text-xs text-muted-foreground">
          Drafts are only visible to payroll managers. Approving freezes the figures and lets each employee see and download their own payslip.
        </p>
      )}
    </div>
  )
}
