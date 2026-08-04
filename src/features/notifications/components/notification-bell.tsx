import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotificationsRealtime,
  useRecentNotifications,
  useUnreadNotificationCount,
} from '@/features/notifications/hooks/use-notifications'
import { NOTIFICATION_PRIORITY_META, resolveNotificationHref } from '@/features/notifications/types'
import { fireBrowserNotification } from '@/features/notifications/lib/browser-push'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import type { NotificationRow } from '@/shared/types/database.types'

export function NotificationBell() {
  const navigate = useNavigate()
  const { activeOrgId, profile } = useAuth()
  const userId = profile?.id ?? null

  const { data: unreadCount } = useUnreadNotificationCount(activeOrgId)
  const { data: recent, isLoading } = useRecentNotifications(activeOrgId)
  const { data: prefs } = useNotificationPreferences(userId)
  const markRead = useMarkNotificationRead(activeOrgId)

  useNotificationsRealtime(activeOrgId, userId, (row: NotificationRow) => {
    if (prefs?.browser_enabled) {
      fireBrowserNotification(row.title, {
        tag: row.id,
        onClick: () => navigate(resolveNotificationHref(row)),
      })
    }
  })

  const openNotification = (n: NonNullable<typeof recent>[number]) => {
    if (!n.is_read) markRead.mutate(n.id)
    navigate(resolveNotificationHref(n))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {Boolean(unreadCount) && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount! > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {Boolean(unreadCount) && <Badge variant="default">{unreadCount} unread</Badge>}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : recent && recent.length > 0 ? (
            <ul className="divide-y divide-border/70">
              {recent.map((n) => {
                const meta = NOTIFICATION_PRIORITY_META[n.priority]
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={cn(
                        'flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent',
                        !n.is_read && 'bg-primary/5',
                      )}
                    >
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', !n.is_read ? 'bg-primary' : 'bg-transparent')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm', !n.is_read && 'font-medium')}>{n.title}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</p>
                          <Badge variant={meta.variant} className="px-1.5 py-0 text-[10px]">{meta.label}</Badge>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">You're all caught up.</div>
          )}
        </div>

        <DropdownMenuItem
          onSelect={() => navigate('/notifications')}
          className="justify-center gap-1.5 rounded-none border-t border-border py-2.5 text-sm font-medium text-primary focus:text-primary"
        >
          <CheckCheck className="h-4 w-4" /> View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
