import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useAppraisals, useAppraisalCycles, type AppraisalRow } from '@/features/appraisals/hooks/use-appraisals'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'

/** What in Appraisals is waiting on this person: their self-appraisal,
 * an acknowledgement, a review as line manager, or sign-off (HR). */
export function useAppraisalsWaiting() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data: rows = [] } = useAppraisals(activeOrgId)
  const { data: cycles = [] } = useAppraisalCycles(activeOrgId)
  const open = new Set(cycles.filter((c) => c.status === 'open').map((c) => c.id))
  const live = rows.filter((a) => open.has(a.cycle_id) || a.status === 'acknowledge')
  const items: { a: AppraisalRow; label: string; action: string }[] = []
  for (const a of live) {
    if (a.user_id === userId && a.status === 'self_review') items.push({ a, label: 'Your self-appraisal is ready', action: 'Fill in' })
    else if (a.user_id === userId && a.status === 'acknowledge') items.push({ a, label: 'Your appraisal is complete — please read and acknowledge it', action: 'Read' })
    else if (a.user_id !== userId && a.manager_user_id === userId && a.status === 'manager_review') items.push({ a, label: 'A team member’s appraisal is waiting for your review', action: 'Review' })
    else if (a.user_id !== userId && a.status === 'sign_off' && has('appraisals.manage')) items.push({ a, label: 'An appraisal is ready for sign-off', action: 'Sign off' })
  }
  return items
}

export function AppraisalsNotice() {
  const items = useAppraisalsWaiting()
  if (items.length === 0) return null
  return (
    <Card className="mt-6 overflow-hidden border-primary/30">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-5 py-3">
        <p className="flex items-center gap-2 font-display text-base font-semibold"><Star className="h-4 w-4 text-primary" /> Appraisals waiting for you</p>
        <Link to="/hr/appraisals" className="text-xs text-primary hover:underline">All appraisals</Link>
      </div>
      <ul className="divide-y divide-border">
        {items.slice(0, 4).map(({ a, label, action }) => (
          <li key={a.id + action} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <p className="text-sm">{label}</p>
            <Button asChild size="sm"><Link to={`/hr/appraisals/${a.id}`}>{action}</Link></Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
