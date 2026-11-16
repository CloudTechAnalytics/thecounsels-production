import { useAuth } from '@/features/auth/context/auth-provider'
import { useCounselUnread, usePlatformNeedsReplyCount } from '@/features/support/hooks/use-support'

function Pill({ count }: { count: number }) {
  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Firm sidebar "From The Counsel": messages from us this person hasn't opened. */
export function CounselMessagesNavBadge() {
  const { activeOrgId } = useAuth()
  const { data } = useCounselUnread(activeOrgId)
  const count = Object.values(data ?? {}).reduce((a, b) => a + b, 0)
  return count ? <Pill count={count} /> : null
}

/** Platform sidebar "Support & Messages": conversations waiting on our reply. */
export function SupportNeedsReplyNavBadge() {
  const { data: count } = usePlatformNeedsReplyCount()
  return count ? <Pill count={count} /> : null
}
