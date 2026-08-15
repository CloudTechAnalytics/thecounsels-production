import { useAuth } from '@/features/auth/context/auth-provider'
import { useUnreadAnnouncementCount } from '@/features/hr/hooks/use-hr'

/** Rendered inline in the HR sidebar's "Announcements" nav item — same
 * small-pill style as the Leave/Messages badges. Unlike Leave, this isn't
 * permission-gated: announcements go to everyone, so everyone's own
 * unread count lights it up. */
export function AnnouncementsNavBadge() {
  const { activeOrgId } = useAuth()
  const { data: count } = useUnreadAnnouncementCount(activeOrgId)
  if (!count) return null
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}
