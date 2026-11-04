import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Banknote, CheckCircle2, Undo2, Scale, Hourglass, AlertTriangle, Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundRequests } from '@/features/funds/hooks/use-funds'
import { useDepartments } from '@/features/hr/hooks/use-hr'
import { FundRequestDetailDialog } from '@/features/funds/components/fund-request-detail-dialog'
import {
  PAID_STATUSES, RETIREMENT_STATUS_META, isRetirementOverdue, outstandingBalance, type FundRequest,
} from '@/features/funds/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ExportButton } from '@/shared/components/export-button'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const ALL = '__all__'

function Kpi({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint?: string; icon: React.ComponentType<{ className?: string }>; tone?: 'warn' | 'bad' }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tone === 'bad' ? 'bg-destructive/10' : tone === 'warn' ? 'bg-warning/15' : 'bg-primary/10')}>
        <Icon className={cn('h-4 w-4', tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-warning' : 'text-primary')} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  )
}

const sum = (rows: FundRequest[], pick: (r: FundRequest) => number) => rows.reduce((s, r) => s + pick(r), 0)

/** Every advance that has been paid out, with its reconciliation position.
 * Staff see their own; finance and partners see the firm's (RLS). */
export function RetirementsPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data: requests = [], isLoading } = useFundRequests(activeOrgId)
  const { data: departments } = useDepartments(activeOrgId)
  const [params, setParams] = useSearchParams()
  const seesFirm = has('funds.manage') || has('funds.approve')

  const paid = React.useMemo(() => requests.filter((r) => PAID_STATUSES.includes(r.status)), [requests])
  const [search, setSearch] = React.useState('')
  const [employee, setEmployee] = React.useState(ALL)
  const [dept, setDept] = React.useState(ALL)
  const [status, setStatus] = React.useState(ALL)
  const [balance, setBalance] = React.useState(ALL)
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  const employees = React.useMemo(
    () => [...new Map(paid.map((r) => [r.user_id, r.requester_name ?? 'Unknown'])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [paid],
  )

  const rows = paid.filter((r) => {
    const paidOn = r.payment_date ?? r.disbursed_at?.slice(0, 10) ?? ''
    const out = outstandingBalance(r)
    return (!search.trim() || [r.request_number ?? '', r.title, r.requester_name ?? ''].some((s) => s.toLowerCase().includes(search.trim().toLowerCase())))
      && (employee === ALL || r.user_id === employee)
      && (dept === ALL || r.department_id === dept)
      && (status === ALL || (status === 'overdue' ? isRetirementOverdue(r) && out > 0 : (r.retirement_status ?? 'not_started') === status))
      && (balance === ALL || (balance === 'outstanding' ? out > 0 : balance === 'excess' ? out < 0 : out === 0))
      && (!from || paidOn >= from) && (!to || paidOn <= to)
  })

  const open = rows.filter((r) => !['retired', 'closed'].includes(r.status))
  const overdue = rows.filter((r) => isRetirementOverdue(r) && outstandingBalance(r) > 0)
  const pendingVerification = rows.filter((r) => Number(r.submitted_expenses) > 0 || Number(r.pending_refunds) > 0)

  const openId = params.get('request')
  const selected = openId ? requests.find((r) => r.id === openId) ?? null : null
  const setSelected = (r: FundRequest | null) => {
    const next = new URLSearchParams(params)
    if (r) { next.set('request', r.id); next.set('focus', 'retirement') }
    else { next.delete('request'); next.delete('focus') }
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Expense Retirement"
        description={seesFirm ? 'Every advance paid out, and how much of it has been accounted for.' : 'Your advances, what you have accounted for, and what is still outstanding.'}
        actions={
          <ExportButton
            filename="expense-retirement" disabled={rows.length === 0}
            sheets={() => [
              {
                name: 'Retirements',
                rows: rows.map((r) => ({
                  Employee: r.requester_name ?? '', Reference: r.request_number ?? '', Purpose: r.title,
                  Department: departments?.find((d) => d.id === r.department_id)?.name ?? '',
                  Approved: Number(r.approved_amount ?? r.amount), Disbursed: Number(r.disbursed_amount ?? 0),
                  'Disbursement ref': r.disbursement_reference ?? '', 'Paid on': r.payment_date ?? '',
                  'Submitted (pending)': Number(r.submitted_expenses), Verified: Number(r.accepted_amount),
                  'Refunds pending': Number(r.pending_refunds), 'Refunds confirmed': Number(r.refunded_amount), Reimbursed: Number(r.reimbursed_amount),
                  Outstanding: outstandingBalance(r), 'Last retirement': r.last_retirement_at ? r.last_retirement_at.slice(0, 10) : '',
                  'Due date': r.retirement_due_date ?? '', Status: RETIREMENT_STATUS_META[r.retirement_status ?? 'not_started']?.label ?? '',
                  Overdue: isRetirementOverdue(r) && outstandingBalance(r) > 0 ? 'Yes' : 'No',
                })),
              },
              {
                name: 'Refunds',
                rows: rows.flatMap((r) => r.refunds.map((f) => ({
                  Employee: r.requester_name ?? '', Reference: r.request_number ?? '', 'Disbursement ref': r.disbursement_reference ?? '',
                  Type: f.direction === 'reimbursement' ? 'Reimbursement to employee' : 'Refund to firm',
                  Amount: Number(f.amount), Date: f.received_on, Method: f.method ?? '', 'Transaction ref': f.reference ?? '',
                  Status: f.status, 'Confirmed at': f.confirmed_at?.slice(0, 10) ?? '', Notes: f.notes ?? '', 'Rejection reason': f.rejection_reason ?? '',
                }))),
              },
            ]}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total disbursed" value={formatNaira(sum(rows, (r) => Number(r.disbursed_amount ?? 0)))} hint={`${rows.length} advance${rows.length === 1 ? '' : 's'}`} icon={Banknote} />
        <Kpi label="Total retired" value={formatNaira(sum(rows, (r) => Number(r.accepted_amount)))} hint="Verified expenses" icon={CheckCircle2} />
        <Kpi label="Refunds received" value={formatNaira(sum(rows, (r) => Number(r.refunded_amount)))} hint="Confirmed by finance" icon={Undo2} />
        <Kpi label="Outstanding balance" value={formatNaira(sum(open, (r) => Math.max(outstandingBalance(r), 0)))} hint={`${open.filter((r) => outstandingBalance(r) > 0).length} open`} icon={Scale} tone="warn" />
        <Kpi label="Pending verification" value={String(pendingVerification.length)} hint={formatNaira(sum(pendingVerification, (r) => Number(r.submitted_expenses) + Number(r.pending_refunds)))} icon={Hourglass} />
        <Kpi label="Overdue retirements" value={String(overdue.length)} hint={formatNaira(sum(overdue, outstandingBalance))} icon={AlertTriangle} tone={overdue.length ? 'bad' : undefined} />
      </div>

      {overdue.length > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {overdue.length} advance{overdue.length === 1 ? ' is' : 's are'} past the retirement deadline with money unaccounted for.
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setStatus('overdue')}>Show overdue</Button>
        </p>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Reference, purpose or employee" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {seesFirm && (
            <Select value={employee} onValueChange={setEmployee}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All employees</SelectItem>
                {employees.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {seesFirm && (
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All departments</SelectItem>
                {(departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              {Object.entries(RETIREMENT_STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={balance} onValueChange={setBalance}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any balance</SelectItem>
              <SelectItem value="outstanding">Balance outstanding</SelectItem>
              <SelectItem value="settled">Fully accounted for</SelectItem>
              <SelectItem value="excess">Spent above advance</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Paid <Input type="date" className="h-9 w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Paid from" />
            to <Input type="date" className="h-9 w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Paid to" />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{paid.length === 0 ? 'No advances have been paid out yet.' : 'No records match these filters.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {seesFirm && <th className="px-3 py-2 font-medium">Employee</th>}
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 text-right font-medium">Disbursed</th>
                  <th className="px-3 py-2 text-right font-medium">Verified</th>
                  <th className="px-3 py-2 text-right font-medium">Submitted</th>
                  <th className="px-3 py-2 text-right font-medium">Refunds</th>
                  <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-3 py-2 font-medium">Last activity</th>
                  <th className="px-3 py-2 font-medium">Due</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const out = outstandingBalance(r)
                  const late = isRetirementOverdue(r) && out > 0
                  const st = RETIREMENT_STATUS_META[r.retirement_status ?? 'not_started'] ?? RETIREMENT_STATUS_META.not_started
                  return (
                    <tr key={r.id} className={cn('border-b border-border/60 last:border-0', late && 'bg-destructive/5')}>
                      {seesFirm && <td className="px-3 py-2">{r.user_id === userId ? 'You' : r.requester_name ?? '—'}</td>}
                      <td className="px-3 py-2"><p className="font-medium">{r.request_number}</p><p className="max-w-[200px] truncate text-xs text-muted-foreground">{r.title}</p></td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNaira(Number(r.disbursed_amount ?? 0))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNaira(Number(r.accepted_amount))}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{Number(r.submitted_expenses) ? formatNaira(Number(r.submitted_expenses)) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNaira(Number(r.refunded_amount))}
                        {Number(r.pending_refunds) > 0 && <p className="text-[11px] text-muted-foreground">+{formatNaira(Number(r.pending_refunds))} pending</p>}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-medium tabular-nums', out > 0 && 'text-warning', out < 0 && 'text-destructive')}>{out < 0 ? `−${formatNaira(-out)}` : formatNaira(out)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{r.last_retirement_at ? format(new Date(r.last_retirement_at), 'MMM d') : '—'}</td>
                      <td className={cn('whitespace-nowrap px-3 py-2', late ? 'font-medium text-destructive' : 'text-muted-foreground')}>{r.retirement_due_date ? format(new Date(r.retirement_due_date), 'MMM d') : '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={st.variant}>{st.label}</Badge>
                          {late && <Badge variant="destructive">Overdue</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-2"><Button size="sm" variant="outline" onClick={() => setSelected(r)}>Open</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <FundRequestDetailDialog request={selected} focus={params.get('focus') ?? undefined} onOpenChange={(o) => { if (!o) setSelected(null) }} />
    </div>
  )
}
