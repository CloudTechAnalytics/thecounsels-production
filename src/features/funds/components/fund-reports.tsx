import * as React from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Wallet, CheckCircle2, Banknote, AlertTriangle } from 'lucide-react'
import { useFundSettings } from '@/features/funds/hooks/use-funds'
import { useAuth } from '@/features/auth/context/auth-provider'
import { FUND_STATUS_META, fundCategoryLabel, daysOutstanding, outstandingBalance, OPEN_ADVANCE_STATUSES, type FundRequest } from '@/features/funds/types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { ExportButton } from '@/shared/components/export-button'
import { DistributionBars } from '@/shared/components/bar-chart'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const RANGES = [
  { value: '1', label: 'This month' },
  { value: '3', label: 'Last 3 months' },
  { value: '12', label: 'Last 12 months' },
  { value: 'all', label: 'All time' },
] as const

function Tile({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint?: string; icon: React.ComponentType<{ className?: string }>; tone?: 'warn' }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className={cn('h-4 w-4', tone === 'warn' ? 'text-warning' : 'text-primary')} />
      </div>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

const sum = (rows: FundRequest[], pick: (r: FundRequest) => number) => rows.reduce((s, r) => s + pick(r), 0)

export function FundReports({ requests }: { requests: FundRequest[] }) {
  const { activeOrgId } = useAuth()
  const { data: settings } = useFundSettings(activeOrgId)
  const dueDays = settings?.retirement_due_days ?? 14
  const [range, setRange] = React.useState<(typeof RANGES)[number]['value']>('3')

  const inRange = React.useMemo(() => {
    if (range === 'all') return requests
    const from = startOfMonth(subMonths(new Date(), Number(range) - 1)).getTime()
    return requests.filter((r) => new Date(r.created_at).getTime() >= from)
  }, [requests, range])

  const live = inRange.filter((r) => r.status !== 'cancelled')
  const approvedLike = live.filter((r) => ['approved', 'payment_processing', 'disbursed', 'retirement_submitted', 'partially_retired', 'retired', 'closed'].includes(r.status))
  const paidOut = live.filter((r) => r.disbursed_at)
  // Outstanding retirements are never range-limited — old unretired cash is exactly what matters most.
  const outstanding = requests
    .filter((r) => OPEN_ADVANCE_STATUSES.includes(r.status) && outstandingBalance(r) > 0)
    .map((r) => ({ r, days: daysOutstanding(r) ?? 0 }))
    .sort((a, b) => b.days - a.days)
  const overdue = outstanding.filter((o) => o.r.status !== 'retirement_submitted' && o.days > dueDays)
  const refunds = requests.flatMap((r) => r.refunds.map((f) => ({ r, f })))

  const byCategory = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const r of approvedLike) m.set(fundCategoryLabel(r.category), (m.get(fundCategoryLabel(r.category)) ?? 0) + Number(r.disbursed_amount ?? r.amount))
    return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [approvedLike])

  const byPerson = React.useMemo(() => {
    const m = new Map<string, { requested: number; paid: number; count: number }>()
    for (const r of live) {
      const k = r.requester_name ?? 'Unknown'
      const cur = m.get(k) ?? { requested: 0, paid: 0, count: 0 }
      cur.requested += Number(r.amount); cur.paid += Number(r.disbursed_amount ?? 0); cur.count += 1
      m.set(k, cur)
    }
    return [...m.entries()].sort((a, b) => b[1].paid - a[1].paid)
  }, [live])

  const exportSheets = () => [
    {
      name: 'Requests',
      rows: inRange.map((r) => ({
        Number: r.request_number,
        Date: format(new Date(r.created_at), 'yyyy-MM-dd'),
        Requester: r.requester_name ?? '',
        Title: r.title,
        Category: fundCategoryLabel(r.category),
        Matter: r.matter_label ?? '',
        Status: FUND_STATUS_META[r.status]?.label ?? r.status,
        Requested: Number(r.amount),
        'Paid out': r.disbursed_amount != null ? Number(r.disbursed_amount) : '',
        'Paid on': r.disbursed_at ? format(new Date(r.disbursed_at), 'yyyy-MM-dd') : '',
        Spent: r.spent_amount != null ? Number(r.spent_amount) : '',
        'Retired on': r.retired_at ? format(new Date(r.retired_at), 'yyyy-MM-dd') : '',
      })),
    },
    {
      name: 'Outstanding retirements',
      rows: outstanding.map(({ r, days }) => ({
        Number: r.request_number,
        Requester: r.requester_name ?? '',
        Title: r.title,
        'Paid out': Number(r.disbursed_amount ?? 0),
        'Paid on': r.disbursed_at ? format(new Date(r.disbursed_at), 'yyyy-MM-dd') : '',
        'Expenses accepted': Number(r.accepted_amount ?? 0),
        Refunded: Number(r.refunded_amount ?? 0),
        Outstanding: outstandingBalance(r),
        'Days out': days,
        Status: FUND_STATUS_META[r.status]?.label ?? r.status,
        Overdue: r.status !== 'retirement_submitted' && days > dueDays ? 'Yes' : 'No',
      })),
    },
    {
      name: 'Refunds received',
      rows: refunds.map(({ r, f }) => ({
        Number: r.request_number, Requester: r.requester_name ?? '', 'Received on': f.received_on,
        Amount: Number(f.amount), Method: f.method ?? '', Reference: f.reference ?? '', Notes: f.notes ?? '',
      })),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', range === r.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {r.label}
            </button>
          ))}
        </div>
        <ExportButton filename="fund-requests-report" sheets={exportSheets} label="Export report" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Requested" value={formatNaira(sum(live, (r) => Number(r.amount)))} hint={`${live.length} request${live.length === 1 ? '' : 's'}`} icon={Wallet} />
        <Tile label="Approved" value={formatNaira(sum(approvedLike, (r) => Number(r.amount)))} hint={`${live.filter((r) => r.status === 'pending').length} awaiting approval`} icon={CheckCircle2} />
        <Tile label="Paid out" value={formatNaira(sum(paidOut, (r) => Number(r.disbursed_amount ?? 0)))} hint={`${live.filter((r) => r.status === 'approved').length} approved, not yet paid`} icon={Banknote} />
        <Tile
          label="Unretired"
          value={formatNaira(sum(outstanding.map((o) => o.r), outstandingBalance))}
          hint={`${outstanding.length} outstanding · ${overdue.length} overdue (>${dueDays} days)`}
          icon={AlertTriangle}
          tone={overdue.length > 0 ? 'warn' : undefined}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <p className="font-display text-base font-semibold">Outstanding retirements</p>
          <p className="text-xs text-muted-foreground">Advances not yet fully accounted for — paid out, minus accepted expenses and refunds received.</p>
        </div>
        {outstanding.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Everything paid out has been retired.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Request</th>
                  <th className="px-4 py-2 font-medium">Staff</th>
                  <th className="px-4 py-2 text-right font-medium">Paid out</th>
                  <th className="px-4 py-2 text-right font-medium">Accepted</th>
                  <th className="px-4 py-2 text-right font-medium">Refunded</th>
                  <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                  <th className="px-4 py-2 text-right font-medium">Days out</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.map(({ r, days }) => {
                  const late = r.status !== 'retirement_submitted' && days > dueDays
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2"><span className="font-medium">{r.request_number}</span> <span className="text-muted-foreground">{r.title}</span></td>
                      <td className="px-4 py-2">{r.requester_name ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(r.disbursed_amount ?? 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(r.accepted_amount ?? 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNaira(Number(r.refunded_amount ?? 0))}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatNaira(outstandingBalance(r))}</td>
                      <td className={cn('px-4 py-2 text-right tabular-nums', late && 'font-medium text-destructive')}>{days}</td>
                      <td className="px-4 py-2"><Badge variant={late ? 'destructive' : FUND_STATUS_META[r.status].variant}>{late ? 'Overdue' : FUND_STATUS_META[r.status].label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-4 font-display text-base font-semibold">Spend by category</p>
          {byCategory.length > 0
            ? <DistributionBars data={byCategory} formatValue={(v) => formatNaira(v)} />
            : <p className="py-6 text-center text-sm text-muted-foreground">No approved requests in this period.</p>}
        </Card>
        <Card className="p-5">
          <p className="mb-4 font-display text-base font-semibold">By staff member</p>
          {byPerson.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Staff</th>
                  <th className="pb-2 text-right font-medium">Requests</th>
                  <th className="pb-2 text-right font-medium">Requested</th>
                  <th className="pb-2 text-right font-medium">Paid out</th>
                </tr>
              </thead>
              <tbody>
                {byPerson.map(([name, v]) => (
                  <tr key={name} className="border-b border-border/60 last:border-0">
                    <td className="py-2">{name}</td>
                    <td className="py-2 text-right tabular-nums">{v.count}</td>
                    <td className="py-2 text-right tabular-nums">{formatNaira(v.requested)}</td>
                    <td className="py-2 text-right tabular-nums">{formatNaira(v.paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">No requests in this period.</p>}
        </Card>
      </div>
    </div>
  )
}
