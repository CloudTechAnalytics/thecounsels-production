import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotificationsRealtime,
  useRecentNotifications,
  useSetNotificationArchived,
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
  const markAllRead = useMarkAllNotificationsRead(activeOrgId)
  const archive = useSetNotificationArchived(activeOrgId)

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
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">Notifications</p>
            {Boolean(unreadCount) && <Badge variant="default">{unreadCount} unread</Badge>}
          </div>
          {Boolean(unreadCount) && (
            <button
              type="button"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : recent && recent.length > 0 ? (
            <ul className="divide-y divide-border/70">
              {recent.map((n) => {
                const meta = NOTIFICATION_PRIORITY_META[n.priority]
                return (
                  <li key={n.id} className={cn('group flex items-start gap-1 px-3 py-2.5', !n.is_read && 'bg-primary/5')}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
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
                    <div className="flex shrink-0 items-center gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {!n.is_read && (
                        <button
                          type="button"
                          aria-label="Mark as read"
                          title="Mark as read"
                          onClick={() => markRead.mutate(n.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Clear notification"
                        title="Clear"
                        onClick={() => archive.mutate({ id: n.id, archived: true })}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
