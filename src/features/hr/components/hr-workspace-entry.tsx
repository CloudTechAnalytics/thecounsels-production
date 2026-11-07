import { format } from 'date-fns'
import { Navigate } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { usePendingLeaveCount, useUnreadAnnouncementCount } from '@/features/hr/hooks/use-hr'
import { useSurveys } from '@/features/surveys/hooks/use-surveys'
import { HR_NAVIGATION } from '@/features/hr/navigation'
import { HrOverviewPage } from '@/features/hr/pages/hr-overview-page'

/** Shown after "HR & Finance" in the main sidebar: how many things in the
 * HR workspace are waiting for this person (leave to approve, unread
 * circulars, surveys to answer) — or a ↗ to show it opens another workspace. */
export function HrWorkspaceNavBadge() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { has: hasFeature } = usePlanFeature(activeOrgId)
  const { data: leave = 0 } = usePendingLeaveCount(has('leave.manage') ? activeOrgId : null)
  const { data: circulars = 0 } = useUnreadAnnouncementCount(hasFeature('circulars') ? activeOrgId : null)
  const { data: surveys = [] } = useSurveys(hasFeature('surveys') ? activeOrgId : null, userId)
  const today = format(new Date(), 'yyyy-MM-dd')
  const waitingSurveys = surveys.filter((s) => s.status === 'open' && s.i_am_recipient && !s.my_responded_at && (!s.closes_on || s.closes_on >= today)).length
  const count = (leave ?? 0) + (circulars ?? 0) + waitingSurveys
  if (!count) return <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-label="Opens the HR & Finance workspace" />
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground"
      title={[leave && `${leave} leave to review`, circulars && `${circulars} unread circular${circulars === 1 ? '' : 's'}`, waitingSurveys && `${waitingSurveys} survey${waitingSurveys === 1 ? '' : 's'} to answer`].filter(Boolean).join(' · ')}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** /hr — HR roles land on the HR dashboard; everyone else on the first HR
 * page they can actually use (e.g. their own Leave), instead of a
 * "no access" screen. */
export function HrHome() {
  const { activeOrgId } = useAuth()
  const { has, hasAny } = usePermissions()
  const { has: hasFeature, isLoading } = usePlanFeature(activeOrgId)
  if (has('hr.view_reports')) return <HrOverviewPage />
  if (isLoading) return null
  for (const section of HR_NAVIGATION) {
    for (const item of section.items) {
      if (item.to === '/hr') continue
      if (item.planFeature && !hasFeature(item.planFeature)) continue
      if (item.permission && !(Array.isArray(item.permission) ? hasAny(item.permission) : has(item.permission))) continue
      return <Navigate to={item.to} replace />
    }
  }
  return <Navigate to="/" replace />
}
