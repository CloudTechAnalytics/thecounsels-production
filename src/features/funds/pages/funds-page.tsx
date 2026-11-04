import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundRequests, useFundApprovalRights, useFundSettings } from '@/features/funds/hooks/use-funds'
import { FundRequestFormDialog } from '@/features/funds/components/fund-request-form-dialog'
import { FundRequestDetailDialog } from '@/features/funds/components/fund-request-detail-dialog'
import { FundReports } from '@/features/funds/components/fund-reports'
import { FUND_STATUS_META, fundCategoryLabel, fundStatusLabel, daysOutstanding, type FundRequest } from '@/features/funds/types'
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

type Tab = 'mine' | 'approve' | 'all' | 'reports'

export function RequestList({ requests, loading, empty, showRequester, onOpen, highlight }: {
  requests: FundRequest[]
  loading: boolean
  empty: string
  showRequester?: boolean
  onOpen: (r: FundRequest) => void
  highlight?: (r: FundRequest) => boolean
}) {
  const { activeOrgId } = useAuth()
  const { data: settings } = useFundSettings(activeOrgId)
  const dueDays = settings?.retirement_due_days ?? 14

  if (loading) {
    return <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
  }
  if (requests.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{empty}</p>

  return (
    <ul className="divide-y divide-border">
      {requests.map((r) => {
        const meta = FUND_STATUS_META[r.status] ?? { label: r.status, variant: 'muted' as const }
        const days = r.status === 'disbursed' || r.status === 'partially_retired' ? daysOutstanding(r) : null
        const overdue = days != null && days > dueDays
        return (
          <li key={r.id}>
            <button
              onClick={() => onOpen(r)}
              className={cn('flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40', highlight?.(r) && 'bg-primary/5')}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {showRequester && <span>{r.requester_name ?? 'Someone'} — </span>}{r.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.request_number ?? 'Draft'} · {fundCategoryLabel(r.category)} · {format(new Date(r.submitted_at ?? r.created_at), 'MMM d, yyyy')}
                  {overdue && <span className="font-medium text-destructive"> · retirement overdue ({days} days)</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{formatNaira(Number(r.approved_amount ?? r.amount))}</p>
                <Badge variant={meta.variant} className="mt-1">{fundStatusLabel(r)}</Badge>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function FundsPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data: requests = [], isLoading } = useFundRequests(activeOrgId)
  const { canActOn } = useFundApprovalRights()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = React.useState(false)
  const canSeeAll = has('funds.approve') || has('funds.manage')
  const canManage = has('funds.manage')
  const canApprove = has('funds.approve')

  const mine = requests.filter((r) => r.user_id === userId)
  const toApprove = requests.filter(canActOn)
  const toDisburse = canManage ? requests.filter((r) => r.status === 'approved' || r.status === 'payment_processing') : []
  const toReview = canManage ? requests.filter((r) => r.status === 'retirement_submitted' && r.user_id !== userId) : []
  const myFollowUps = mine.filter((r) => r.status === 'returned' || r.status === 'disbursed' || r.status === 'partially_retired')
  const actionCount = toApprove.length + toDisburse.length + toReview.length + myFollowUps.length

  const [tab, setTab] = React.useState<Tab>('mine')
  React.useEffect(() => {
    if (!isLoading && toApprove.length + toDisburse.length + toReview.length > 0) setTab((t) => (t === 'mine' ? 'approve' : t))
    // Only on first load — afterwards the user's own tab choice wins.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const all = requests.filter((r) =>
    r.status !== 'draft'
    && (status === 'all' || r.status === status)
    && (!search.trim() || [r.title, r.request_number ?? '', r.requester_name ?? ''].some((s) => s.toLowerCase().includes(search.trim().toLowerCase()))),
  )

  const openId = params.get('request')
  const open = openId ? requests.find((r) => r.id === openId) ?? null : null
  const setOpen = (r: FundRequest | null) => {
    const next = new URLSearchParams(params)
    if (r) next.set('request', r.id)
    else next.delete('request')
    setParams(next, { replace: true })
  }

  const tabs: { key: Tab; label: string; show: boolean; count?: number }[] = [
    { key: 'mine', label: 'My requests', show: true },
    { key: 'approve', label: canApprove || canManage ? 'Needs my action' : 'To follow up', show: true, count: actionCount },
    { key: 'all', label: 'All requests', show: canSeeAll },
    { key: 'reports', label: 'Reports', show: canManage },
  ]

  return (
    <div>
      <PageHeader
        title="Fund Requests"
        description="Request money for work, get it approved and paid, then retire it with receipts."
        actions={<Button onClick={() => setCreating(true)}>Request funds</Button>}
      />

      <div className="mb-4 flex w-fit max-w-full flex-wrap rounded-lg border border-border p-0.5">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.count ? <span className={cn('rounded-full px-1.5 text-[11px]', tab === t.key ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary')}>{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'mine' && (
        <Card className="overflow-hidden">
          <RequestList
            requests={mine} loading={isLoading} empty="You haven't requested any funds yet." onOpen={setOpen}
            highlight={(r) => ['disbursed', 'partially_retired', 'returned', 'draft'].includes(r.status)}
          />
        </Card>
      )}

      {tab === 'approve' && (
        <div className="space-y-6">
          {[
            { title: 'Waiting for your approval', rows: toApprove, show: canApprove, requester: true },
            { title: 'Yours to follow up — clarify or retire', rows: myFollowUps, show: myFollowUps.length > 0 || !(canApprove || canManage), requester: false },
            { title: 'Approved — ready to pay out', rows: toDisburse, show: canManage, requester: true },
            { title: 'Retirements and refunds to verify', rows: toReview, show: canManage, requester: true },
          ].filter((s) => s.show).map((s) => (
            <section key={s.title}>
              <p className="mb-2 font-display text-sm font-semibold">{s.title} <span className="text-muted-foreground">({s.rows.length})</span></p>
              <Card className="overflow-hidden">
                <RequestList requests={s.rows} loading={isLoading} empty="Nothing here right now." showRequester={s.requester} onOpen={setOpen} />
              </Card>
            </section>
          ))}
        </div>
      )}

      {tab === 'all' && canSeeAll && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search title, number or staff" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(FUND_STATUS_META).filter(([k]) => k !== 'draft').map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <ExportButton
              filename="fund-requests"
              sheets={() => [{
                name: 'Fund requests',
                rows: all.map((r) => ({
                  Number: r.request_number ?? '',
                  Submitted: r.submitted_at ? format(new Date(r.submitted_at), 'yyyy-MM-dd') : '',
                  Requester: r.requester_name ?? '',
                  Title: r.title,
                  Category: fundCategoryLabel(r.category),
                  Client: r.client_label ?? '',
                  Matter: r.matter_label ?? '',
                  Status: fundStatusLabel(r),
                  Requested: Number(r.amount),
                  Approved: r.approved_amount != null ? Number(r.approved_amount) : '',
                  'Paid out': r.disbursed_amount != null ? Number(r.disbursed_amount) : '',
                  'Payment date': r.payment_date ?? '',
                  Spent: r.spent_amount != null ? Number(r.spent_amount) : '',
                })),
              }]}
            />
          </div>
          <RequestList requests={all} loading={isLoading} empty="No requests match." showRequester onOpen={setOpen} />
        </Card>
      )}

      {tab === 'reports' && canManage && <FundReports requests={requests.filter((r) => r.status !== 'draft')} />}

      <FundRequestFormDialog open={creating} onOpenChange={setCreating} />
      <FundRequestDetailDialog request={open} onOpenChange={(o) => { if (!o) setOpen(null) }} />
    </div>
  )
}
