import { useAuth } from '@/features/auth/context/auth-provider'
import { useUnreadMessageCount } from '@/features/messaging/hooks/use-messaging'

/** Rendered inline in the sidebar's "Messages" nav item — same small-pill
 * style as the topbar notification bell's badge, sized for inline nav. */
export function MessagesNavBadge() {
  const { activeOrgId } = useAuth()
  const { data: count } = useUnreadMessageCount(activeOrgId)
  if (!count) return null
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}
