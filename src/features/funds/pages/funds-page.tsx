import * as React from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, X, FilePlus2, BadgeCheck, Banknote, ReceiptText } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundRequests, useFundApprovalRights } from '@/features/funds/hooks/use-funds'
import { RequestList } from '@/features/funds/components/request-list'
import { FundReports } from '@/features/funds/components/fund-reports'
import { FUND_STATUS_META, fundCategoryLabel, fundStatusLabel } from '@/features/funds/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ExportButton } from '@/shared/components/export-button'
import { cn } from '@/shared/lib/utils'

type Tab = 'mine' | 'approve' | 'all' | 'reports'

const HOW_KEY = 'counsel.funds.how-it-works.hidden'

/** Four-step explainer for first-time users; dismissible, remembered per browser. */
function HowItWorks() {
  const [hidden, setHidden] = React.useState(() => { try { return localStorage.getItem(HOW_KEY) === '1' } catch { return false } })
  if (hidden) {
    return (
      <button className="mb-4 text-xs text-primary hover:underline" onClick={() => { setHidden(false); try { localStorage.removeItem(HOW_KEY) } catch { /* ignore */ } }}>
        How fund requests work
      </button>
    )
  }
  const steps = [
    { icon: FilePlus2, title: 'Request', text: 'Say what the money is for and how much. Save a draft or submit.' },
    { icon: BadgeCheck, title: 'Approval', text: 'Your firm’s approvers sign off. You can edit until someone acts on it.' },
    { icon: Banknote, title: 'Payment', text: 'Finance pays you and records the transfer.' },
    { icon: ReceiptText, title: 'Retire', text: 'Upload receipts for what you spent and return any money left over.' },
  ]
  return (
    <Card className="mb-5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">How fund requests work</p>
        <button className="text-muted-foreground hover:text-foreground" aria-label="Hide" onClick={() => { setHidden(true); try { localStorage.setItem(HOW_KEY, '1') } catch { /* ignore */ } }}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="grid gap-3 sm:grid-cols-4">
        {steps.map((st, i) => (
          <li key={st.title} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><st.icon className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-medium">{i + 1}. {st.title}</p>
              <p className="text-xs text-muted-foreground">{st.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">Every request in your list tells you its next step — look for the button on the right.</p>
    </Card>
  )
}

export function FundsPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data: requests = [], isLoading } = useFundRequests(activeOrgId)
  const { canActOn } = useFundApprovalRights()
  const [params] = useSearchParams()
  const navigate = useNavigate()
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


  const legacyId = params.get('request')
  if (legacyId) return <Navigate to={`/hr/funds/${legacyId}`} replace />

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
        actions={<Button onClick={() => navigate('/hr/funds/new')}>Request funds</Button>}
      />
      <HowItWorks />

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
            requests={mine} loading={isLoading} empty="You haven't requested any funds yet — use Request funds at the top right."
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
                <RequestList requests={s.rows} loading={isLoading} empty="Nothing here right now." showRequester={s.requester} />
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
          <RequestList requests={all} loading={isLoading} empty="No requests match." showRequester />
        </Card>
      )}

      {tab === 'reports' && canManage && <FundReports requests={requests.filter((r) => r.status !== 'draft')} />}

    </div>
  )
}
