import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, Trash2 } from 'lucide-react'
import { usePlatformActivity } from '@/features/platform/hooks/use-platform'
import { Button } from '@/shared/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { titleCase } from '@/shared/lib/format'

const SEEN_KEY = 'counsel.platform_notifications_seen_at'
// Distinct from SEEN_KEY: seenAt only silences the unread dot, clearedAt
// actually empties this bell's list for this admin going forward. Doesn't
// touch audit_logs itself (a real audit trail every platform admin
// shares — nothing here is ever deleted), only what this bell shows this
// user in this browser, same "local, per-user, no server round trip"
// posture SEEN_KEY already had.
const CLEARED_KEY = 'counsel.platform_notifications_cleared_at'

/** Platform-wide activity bell — same audit_logs feed as the dashboard and Audit Logs page. */
export function PlatformNotifications() {
  const navigate = useNavigate()
  const { data: rawActivity, isLoading, live } = usePlatformActivity()
  const [seenAt, setSeenAt] = React.useState<string | null>(() => localStorage.getItem(SEEN_KEY))
  const [clearedAt, setClearedAt] = React.useState<string | null>(() => localStorage.getItem(CLEARED_KEY))

  const activity = React.useMemo(() => {
    if (!rawActivity || !clearedAt) return rawActivity
    const cleared = new Date(clearedAt).getTime()
    return rawActivity.filter((a) => new Date(a.created_at).getTime() > cleared)
  }, [rawActivity, clearedAt])

  const unreadCount = React.useMemo(() => {
    if (!activity) return 0
    if (!seenAt) return activity.length
    const seen = new Date(seenAt).getTime()
    return activity.filter((a) => new Date(a.created_at).getTime() > seen).length
  }, [activity, seenAt])

  const handleOpenChange = (open: boolean) => {
    if (!open) return
    const now = new Date().toISOString()
    localStorage.setItem(SEEN_KEY, now)
    setSeenAt(now)
  }

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation()
    const now = new Date().toISOString()
    localStorage.setItem(CLEARED_KEY, now)
    setClearedAt(now)
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Platform activity</p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-success' : 'bg-muted-foreground/40'}`} />
              {live ? 'Live' : 'Connecting…'}
            </span>
            {activity && activity.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                title="Clear this list (doesn't delete the underlying audit log)"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : activity && activity.length > 0 ? (
            <ul className="divide-y divide-border/70">
              {activity.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                    {titleCase(entry.action.split('.')[0]).slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{entry.summary ?? titleCase(entry.action.replace(/\./g, ' '))}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {clearedAt ? 'Cleared — new activity will show up here.' : 'No activity yet.'}
            </div>
          )}
        </div>

        <DropdownMenuItem
          onSelect={() => navigate('/platform/audit')}
          className="justify-center rounded-none border-t border-border py-2.5 text-sm font-medium text-primary focus:text-primary"
        >
          View all audit logs
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
