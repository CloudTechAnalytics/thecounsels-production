import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ClipboardList, Wallet, Banknote, ReceiptText, HandCoins, CalendarClock, Inbox, AlertTriangle, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { useFundRequests, useFundApprovalRights } from '@/features/funds/hooks/use-funds'
import { useAllLeaveRequests, useAllHrRequests } from '@/features/hr/hooks/use-hr'
import { fundRequestPath } from '@/features/funds/lib/next-step'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatNaira } from '@/shared/lib/format'
import { useApprovalRights } from '@/features/hr/hooks/use-approval-rules'
import { useMyReports } from '@/features/hr/hooks/use-my-reports'

interface Action {
  key: string
  icon: LucideIcon
  title: string
  detail: string
  at: string | null
  label: string
  to: string
}

/** Everything across the firm that is waiting on the signed-in user, each
 * with the button that does it. Only shows what they're allowed to act on. */
export function PendingActionsCard({ overdueInvoices, className }: { overdueInvoices?: number; className?: string }) {
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { has: hasFeature } = usePlanFeature(activeOrgId)
  const hr = hasFeature('hr_module')
  const { isLineManager, reportUserIds } = useMyReports()
  const canFunds = hr && (has('funds.approve') || has('funds.manage') || isLineManager)
  const { data: funds, isLoading: l1 } = useFundRequests(canFunds ? activeOrgId : null)
  const { data: leave, isLoading: l2 } = useAllLeaveRequests(hr && (has('leave.manage') || isLineManager) ? activeOrgId : null)
  const { data: hrReqs, isLoading: l3 } = useAllHrRequests(hr && has('hr_requests.manage') ? activeOrgId : null)
  const { canActOn, canApproveClaim, canFinance } = useFundApprovalRights()
  const { can } = useApprovalRights()

  const actions = React.useMemo<Action[]>(() => {
    const out: Action[] = []
    for (const r of funds ?? []) {
      if (r.user_id === userId) continue
      const who = r.requester_name ?? 'Someone'
      if (canActOn(r)) out.push({ key: `a-${r.id}`, icon: Wallet, title: `Fund request — ${r.title}`, detail: `${who} · ${formatNaira(Number(r.approved_amount ?? r.amount))}`, at: r.submitted_at, label: 'Review', to: fundRequestPath(r.id) })
      if (canApproveClaim(r)) out.push({ key: `c-${r.id}`, icon: HandCoins, title: `Reimbursement claim — ${r.request_number}`, detail: `${who} · ${formatNaira(Number(r.reimbursement_claimed))}`, at: r.last_retirement_at, label: 'Review', to: fundRequestPath(r.id, 'refunds') })
      if (!canFinance(r)) continue
      if (r.status === 'approved' || r.status === 'payment_processing') out.push({ key: `p-${r.id}`, icon: Banknote, title: `Pay out — ${r.title}`, detail: `${who} · ${formatNaira(Number(r.approved_amount ?? r.amount))}`, at: r.updated_at, label: 'Pay out', to: fundRequestPath(r.id) })
      if (r.status === 'retirement_submitted') out.push({ key: `v-${r.id}`, icon: ReceiptText, title: `Expense retirement — ${r.request_number}`, detail: `${who} · ${formatNaira(Number(r.submitted_expenses) + Number(r.pending_refunds))} to check`, at: r.last_retirement_at, label: 'Verify', to: fundRequestPath(r.id, Number(r.submitted_expenses) > 0 ? 'expenses' : 'refunds') })
      if (Number(r.reimbursement_due) > 0) out.push({ key: `d-${r.id}`, icon: HandCoins, title: `Reimbursement to pay — ${r.request_number}`, detail: `${who} · ${formatNaira(Number(r.reimbursement_due))}`, at: r.updated_at, label: 'Pay', to: fundRequestPath(r.id, 'refunds') })
    }
    for (const l of leave ?? []) {
      if (l.status !== 'pending' || l.user_id === userId || !(can('leave') || reportUserIds.has(l.user_id))) continue
      out.push({ key: `l-${l.id}`, icon: CalendarClock, title: 'Leave application', detail: `${l.requester_name ?? 'Someone'} · ${l.days} day${Number(l.days) === 1 ? '' : 's'}`, at: l.created_at, label: 'Approve', to: '/hr/approvals' })
    }
    for (const h of hrReqs ?? []) {
      if (!['submitted', 'in_review'].includes(h.status) || h.user_id === userId || !can('hr_request')) continue
      out.push({ key: `h-${h.id}`, icon: Inbox, title: `HR request — ${h.subject}`, detail: h.requester_name ?? 'Someone', at: h.created_at, label: 'Handle', to: '/hr/requests' })
    }
    out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    if (overdueInvoices) out.unshift({ key: 'inv', icon: AlertTriangle, title: `${overdueInvoices} overdue invoice${overdueInvoices === 1 ? '' : 's'}`, detail: 'Past their due date — follow up with clients', at: null, label: 'Open', to: '/billing' })
    return out
  }, [funds, leave, hrReqs, userId, canActOn, canApproveClaim, canFinance, can, reportUserIds, overdueInvoices])

  const loading = (canFunds && l1) || l2 || l3
  const shown = actions.slice(0, 6)

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><ClipboardList className="h-4 w-4 text-primary" /> Pending actions</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{actions.length ? `${actions.length} waiting for you` : 'Waiting for your decision'}</p>
        </div>
        {hr && <Link to="/hr/approvals" className="text-xs text-primary hover:underline">View all</Link>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">You’re all caught up.</p>
        ) : (
          <ul className="space-y-3">
            {shown.map((a) => (
              <li key={a.key} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><a.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{a.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{a.detail}{a.at ? ` · ${formatDistanceToNow(new Date(a.at), { addSuffix: true })}` : ''}</span>
                </span>
                <Button size="sm" variant={a.label === 'Open' ? 'outline' : 'default'} onClick={() => navigate(a.to)}>{a.label}</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
