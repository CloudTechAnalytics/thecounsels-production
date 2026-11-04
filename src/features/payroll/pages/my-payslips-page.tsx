import { format } from 'date-fns'
import { Printer } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMyPayslips } from '@/features/payroll/hooks/use-payroll'
import { printPayslip } from '@/features/payroll/lib/print-payslip'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'

export function MyPayslipsPage() {
  const { activeOrgId, userId, activeMembership } = useAuth()
  const { data: slips = [], isLoading } = useMyPayslips(activeOrgId, userId)
  const year = new Date().getFullYear()
  const thisYear = slips.filter((s) => s.period.startsWith(String(year)))
  const ytd = (k: 'gross' | 'paye' | 'pension_employee' | 'net') => thisYear.reduce((s, p) => s + Number(p[k]), 0)

  return (
    <div>
      <PageHeader title="My Payslips" description="Your monthly payslips, ready to view or save as PDF." />

      {thisYear.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: `Gross pay ${year}`, value: ytd('gross') },
            { label: 'PAYE paid', value: ytd('paye') },
            { label: 'Pension saved', value: ytd('pension_employee') },
            { label: 'Net pay', value: ytd('net') },
          ].map((k) => (
            <Card key={k.label} className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
              <p className="mt-1 font-display text-2xl font-semibold">{formatNaira(k.value)}</p>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : slips.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No payslips yet. They appear here once payroll for the month is approved.</p>
        ) : (
          <ul className="divide-y divide-border">
            {slips.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium">{format(new Date(s.period + 'T00:00:00'), 'MMMM yyyy')}</p>
                  <p className="text-xs text-muted-foreground">Gross {formatNaira(Number(s.gross))} · PAYE {formatNaira(Number(s.paye))}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatNaira(Number(s.net))}</p>
                    <Badge variant={s.run_status === 'paid' ? 'success' : 'default'}>{s.run_status === 'paid' ? 'Paid' : 'Approved'}</Badge>
                  </div>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => activeMembership && printPayslip(s, s.period, activeMembership.organization)}
                  >
                    <Printer className="h-4 w-4" /> Payslip
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
