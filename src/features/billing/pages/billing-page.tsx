import * as React from 'react'
import { format } from 'date-fns'
import { Banknote, Clock, Wallet, FileText, CircleDollarSign, AlertTriangle, Plus, Trash2, Receipt } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useBillingStats,
  usePersonalStats,
  useUnbilledTime,
  useUnbilledExpenses,
  useInvoices,
  useDeleteTimeEntry,
  useDeleteExpense,
} from '@/features/billing/hooks/use-billing'
import { TimeEntryDialog, ExpenseDialog } from '@/features/billing/components/log-dialogs'
import { GenerateInvoiceDialog, InvoiceDetailDialog } from '@/features/billing/components/invoice-dialogs'
import { INVOICE_STATUS_META, timeAmount, type ExpenseRow, type InvoiceRow, type TimeEntryRow } from '@/features/billing/types'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { formatNaira, formatMoneyCompact } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

export function BillingPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canFinancials = has('reports.financial')
  const canInvoice = has('invoices.manage')
  // Firm-wide financials are restricted; everyone else gets their own numbers.
  const stats = useBillingStats(canFinancials ? activeOrgId : null)
  const personal = usePersonalStats(canFinancials ? null : activeOrgId, userId)
  const time = useUnbilledTime(activeOrgId)
  const expenses = useUnbilledExpenses(activeOrgId)
  const invoices = useInvoices(activeOrgId)
  const [tab, setTab] = React.useState<'work' | 'invoices'>('work')

  // Without reports.financial you see (and can delete) only your own entries.
  const timeRows = (time.data ?? []).filter((t) => canFinancials || t.user?.id === userId)
  const expenseRows = (expenses.data ?? []).filter((e) => canFinancials || e.user?.id === userId)

  const [timeOpen, setTimeOpen] = React.useState(false)
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [genOpen, setGenOpen] = React.useState(false)
  const [invoiceId, setInvoiceId] = React.useState<string | null>(null)

  const s = stats.data
  const p = personal.data

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Time, expenses, invoices and payments."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTimeOpen(true)}><Plus /> Log time</Button>
            <Button variant="outline" onClick={() => setExpenseOpen(true)}><Plus /> Log expense</Button>
            {canInvoice && <Button onClick={() => setGenOpen(true)}><Receipt className="h-4 w-4" /> Generate invoice</Button>}
          </div>
        }
      />

      {canFinancials ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatTile label="Revenue (MTD)" value={s ? formatMoneyCompact(s.revenueMTD) : '—'} icon={Banknote} />
          <StatTile label="Billable hours (MTD)" value={s ? `${s.billableHoursMTD}h` : '—'} icon={Clock} />
          <StatTile label="Unbilled (WIP)" value={s ? formatMoneyCompact(s.unbilledValue) : '—'} icon={Wallet} />
          <StatTile label="Invoiced" value={s ? formatMoneyCompact(s.invoiced) : '—'} icon={FileText} />
          <StatTile label="Collected" value={s ? formatMoneyCompact(s.collected) : '—'} icon={CircleDollarSign} />
          <StatTile label="Outstanding" value={s ? formatMoneyCompact(s.outstanding) : '—'} icon={AlertTriangle} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="My billable hours (MTD)" value={p ? `${p.billableHoursMTD}h` : '—'} hint="Time you logged this month" icon={Clock} />
          <StatTile label="My unbilled work" value={p ? formatMoneyCompact(p.unbilledValue) : '—'} hint="Your time & expenses awaiting invoicing" icon={Wallet} />
          <StatTile label="My expenses (MTD)" value={p ? formatMoneyCompact(p.expensesMTD) : '—'} hint="Expenses you logged this month" icon={Receipt} />
        </div>
      )}

      <div className="mt-6 flex items-end justify-between gap-3 border-b border-border">
        <div className="flex gap-1">
          {(canInvoice ? (['work', 'invoices'] as const) : (['work'] as const)).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'work' ? 'Unbilled work' : 'Invoices'}
            </button>
          ))}
        </div>
        <div className="pb-1.5">
          {tab === 'invoices' && canInvoice ? (
            <ExportButton
              filename="invoices"
              disabled={!invoices.data?.length}
              sheets={() => [{
                name: 'Invoices',
                rows: (invoices.data ?? []).map((inv) => ({
                  'Invoice #': inv.invoice_number ?? '',
                  Client: inv.client?.display_name ?? '',
                  Matter: inv.matter?.matter_number ?? '',
                  Issued: inv.issue_date,
                  Due: inv.due_date ?? '',
                  Status: INVOICE_STATUS_META[inv.status].label,
                  Total: Number(inv.total),
                  Paid: Number(inv.amount_paid),
                  Balance: Number(inv.total) - Number(inv.amount_paid),
                })),
              }]}
            />
          ) : (
            <ExportButton
              filename="unbilled-work"
              disabled={timeRows.length === 0 && expenseRows.length === 0}
              sheets={() => [
                {
                  name: 'Unbilled time',
                  rows: timeRows.map((t) => ({
                    Date: t.work_date,
                    Description: t.description,
                    Matter: t.matter?.matter_number ?? '',
                    Lawyer: t.user?.full_name ?? '',
                    Hours: Number((t.minutes / 60).toFixed(2)),
                    Rate: Number(t.rate),
                    Amount: timeAmount(t.minutes, Number(t.rate)),
                    Billable: t.billable ? 'Yes' : 'No',
                  })),
                },
                {
                  name: 'Unbilled expenses',
                  rows: expenseRows.map((e) => ({
                    Date: e.expense_date,
                    Description: e.description,
                    Matter: e.matter?.matter_number ?? '',
                    Category: e.category ?? '',
                    Amount: Number(e.amount),
                    Billable: e.billable ? 'Yes' : 'No',
                  })),
                },
              ]}
            />
          )}
        </div>
      </div>

      <div className="mt-6">
        {tab === 'invoices' && canInvoice ? (
          <InvoicesTab invoices={invoices} onOpen={setInvoiceId} />
        ) : (
          <UnbilledWork timeRows={timeRows} expenseRows={expenseRows} timeLoading={time.isLoading} expensesLoading={expenses.isLoading} />
        )}
      </div>

      <TimeEntryDialog open={timeOpen} onOpenChange={setTimeOpen} />
      <ExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} />
      <GenerateInvoiceDialog open={genOpen} onOpenChange={setGenOpen} onGenerated={setInvoiceId} />
      <InvoiceDetailDialog invoiceId={invoiceId} open={Boolean(invoiceId)} onOpenChange={(o) => !o && setInvoiceId(null)} />
    </div>
  )
}

function UnbilledWork({
  timeRows,
  expenseRows,
  timeLoading,
  expensesLoading,
}: {
  timeRows: TimeEntryRow[]
  expenseRows: ExpenseRow[]
  timeLoading: boolean
  expensesLoading: boolean
}) {
  const { activeOrgId } = useAuth()
  const delTime = useDeleteTimeEntry(activeOrgId)
  const delExp = useDeleteExpense(activeOrgId)

  const del = async (fn: () => Promise<void>) => {
    try { await fn() } catch (err) { toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined }) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unbilled time</h2>
        <Card className="overflow-hidden">
          {timeLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : timeRows.length > 0 ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Description</TableHead><TableHead>Matter</TableHead><TableHead>Date</TableHead>
                <TableHead className="text-right">Hours</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {timeRows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{t.description}{!t.billable && <Badge variant="muted" className="ml-2">Non-billable</Badge>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.matter?.matter_number ?? (t.billable ? <Badge variant="warning">No matter — can't be invoiced</Badge> : '—')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(t.work_date), 'MMM d')}</TableCell>
                    <TableCell className="text-right text-sm">{(t.minutes / 60).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatNaira(timeAmount(t.minutes, Number(t.rate)))}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => del(() => delTime.mutateAsync(t.id))}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">No unbilled time. Log time to start building an invoice.</p>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Unbilled expenses</h2>
        <Card className="overflow-hidden">
          {expensesLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : expenseRows.length > 0 ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Description</TableHead><TableHead>Matter</TableHead><TableHead>Category</TableHead>
                <TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {expenseRows.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.matter?.matter_number ?? (e.billable ? <Badge variant="warning">No matter — can't be invoiced</Badge> : '—')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.category ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(e.expense_date), 'MMM d')}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatNaira(Number(e.amount))}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => del(() => delExp.mutateAsync(e.id))}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">No unbilled expenses.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function InvoicesTab({
  invoices,
  onOpen,
}: {
  invoices: { data?: InvoiceRow[]; isLoading: boolean }
  onOpen: (id: string) => void
}) {
  return (
    <Card className="overflow-hidden">
      {invoices.isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : invoices.data && invoices.data.length > 0 ? (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Client</TableHead><TableHead>Issued</TableHead>
            <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {invoices.data.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer" onClick={() => onOpen(inv.id)}>
                <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                <TableCell className="text-sm">{inv.client?.display_name ?? '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.issue_date), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatNaira(Number(inv.total))}</TableCell>
                <TableCell className="text-right text-sm">{formatNaira(Number(inv.total) - Number(inv.amount_paid))}</TableCell>
                <TableCell><Badge variant={INVOICE_STATUS_META[inv.status].variant}>{INVOICE_STATUS_META[inv.status].label}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Receipt className="h-7 w-7" /></span>
          <p className="font-display text-lg font-semibold">No invoices yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">Log time and expenses, then generate an invoice from unbilled work.</p>
        </div>
      )}
    </Card>
  )
}
