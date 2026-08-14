import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePendingLeaveCount } from '@/features/hr/hooks/use-hr'

/** Rendered inline in the HR sidebar's "Leave" nav item — same small-pill
 * style as the Messages badge. Only ever fetched for someone who can
 * actually approve leave; a regular employee's own pending request
 * doesn't light this up (that's what the notification bell is for). */
export function LeaveNavBadge() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: count } = usePendingLeaveCount(has('leave.manage') ? activeOrgId : null)
  if (!count) return null
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}
