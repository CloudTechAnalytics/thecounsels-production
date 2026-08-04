import * as React from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow, format, isPast, isToday } from 'date-fns'
import {
  BellRing, Gavel, CheckSquare, Search, MoreHorizontal, CheckCheck, Archive, ArchiveRestore, Trash2,
  ChevronLeft, ChevronRight, Bell as BellIcon, Smartphone, Mail, MessageSquare,
} from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useHearings } from '@/features/hearings/hooks/use-hearings'
import { useTasks } from '@/features/tasks/hooks/use-tasks'
import {
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationPreferences,
  useNotifications,
  useSetNotificationArchived,
  useUpdateNotificationPreferences,
} from '@/features/notifications/hooks/use-notifications'
import { NOTIFICATIONS_PAGE_SIZE, type NotificationFilters } from '@/features/notifications/services/notifications.service'
import { NOTIFICATION_CATEGORY_META, NOTIFICATION_PRIORITY_META, resolveNotificationHref } from '@/features/notifications/types'
import { isBrowserPushSupported, requestBrowserPushPermission } from '@/features/notifications/lib/browser-push'
import { PageHeader } from '@/shared/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'
import type { NotificationCategory, NotificationPriority } from '@/shared/types/database.types'

interface Reminder {
  id: string
  kind: 'hearing' | 'task'
  title: string
  date: Date
  href?: string
}

const ALL = 'all'
const CATEGORY_ORDER: NotificationCategory[] = ['matters', 'clients', 'hearings', 'billing', 'tasks', 'documents', 'notes']
const TABS = ['Notifications', 'Preferences'] as const
type Tab = (typeof TABS)[number]

function RemindersCard() {
  const { activeOrgId, profile } = useAuth()
  const { from, to } = React.useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 14)
    end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }, [])
  const in14 = new Date(to)
  const { data: hearings } = useHearings(activeOrgId, { from, to, status: 'scheduled' })
  const { data: tasks } = useTasks(activeOrgId, { status: 'all', assigneeId: 'all' }, profile?.id ?? null)

  const reminders: Reminder[] = [
    ...(hearings ?? []).map((h) => ({
      id: `h-${h.id}`,
      kind: 'hearing' as const,
      title: h.title,
      date: new Date(h.hearing_at),
      href: h.matter ? `/matters/${h.matter.id}` : '/hearings',
    })),
    ...(tasks ?? [])
      .filter((t) => t.status !== 'done' && t.due_date)
      .map((t) => ({
        id: `t-${t.id}`,
        kind: 'task' as const,
        title: t.title,
        date: new Date(t.due_date + 'T09:00:00'),
        href: t.matter ? `/matters/${t.matter.id}` : '/tasks',
      })),
  ]
    .filter((r) => r.date <= in14)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">Reminders</CardTitle>
        <BellRing className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {reminders.length > 0 ? (
          <ul className="space-y-2">
            {reminders.map((r) => {
              const overdue = isPast(r.date) && !isToday(r.date)
              return (
                <li key={r.id}>
                  <Link to={r.href ?? '#'} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 hover:border-primary/40">
                    <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {r.kind === 'hearing' ? <Gavel className="h-4 w-4" /> : <CheckSquare className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.title}</p>
                      <p className={cn('text-xs', overdue ? 'font-medium text-destructive' : isToday(r.date) ? 'font-medium text-primary' : 'text-muted-foreground')}>
                        {overdue ? 'Overdue · ' : isToday(r.date) ? 'Today · ' : ''}
                        {format(r.date, r.kind === 'hearing' ? 'MMM d, HH:mm' : 'MMM d')}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">{r.kind}</Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">Upcoming hearings and task deadlines (next 14 days) will appear here.</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function NotificationsList() {
  const { activeOrgId } = useAuth()
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<NotificationCategory | 'all'>('all')
  const [priority, setPriority] = React.useState<NotificationPriority | 'all'>('all')
  const [archived, setArchived] = React.useState(false)
  const [page, setPage] = React.useState(1)

  const filters: NotificationFilters = { search: search || undefined, category, priority, archived }
  const { data, isLoading } = useNotifications(activeOrgId, filters, page)
  const markRead = useMarkNotificationRead(activeOrgId)
  const markAllRead = useMarkAllNotificationsRead(activeOrgId)
  const setArchivedMut = useSetNotificationArchived(activeOrgId)
  const del = useDeleteNotification(activeOrgId)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE))
  const hasUnread = rows.some((r) => !r.is_read)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search notifications…" className="pl-9" />
          </div>
          <Select value={category} onValueChange={(v) => { setCategory(v as typeof category); setPage(1) }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {CATEGORY_ORDER.map((c) => <SelectItem key={c} value={c}>{NOTIFICATION_CATEGORY_META[c].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => { setPriority(v as typeof priority); setPage(1) }}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All priorities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {(Object.keys(NOTIFICATION_PRIORITY_META) as NotificationPriority[]).map((p) => (
                <SelectItem key={p} value={p}>{NOTIFICATION_PRIORITY_META[p].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setArchived((a) => !a); setPage(1) }}>
            {archived ? <><ArchiveRestore className="h-4 w-4" /> Showing archived</> : <><Archive className="h-4 w-4" /> Show archived</>}
          </Button>
        </div>
        {!archived && (
          <Button variant="outline" size="sm" disabled={!hasUnread || markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" /> Mark all as read
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : rows.length > 0 ? (
          <>
            <ul className="divide-y divide-border/70">
              {rows.map((n) => {
                const meta = NOTIFICATION_PRIORITY_META[n.priority]
                return (
                  <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3', !n.is_read && 'bg-primary/5')}>
                    <Link
                      to={resolveNotificationHref(n)}
                      onClick={() => { if (!n.is_read) markRead.mutate(n.id) }}
                      className="flex min-w-0 flex-1 items-start gap-3"
                    >
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', !n.is_read ? 'bg-primary' : 'bg-transparent')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', !n.is_read && 'font-medium')}>{n.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                          <Badge variant="outline" className="text-[10px]">{NOTIFICATION_CATEGORY_META[n.category].label}</Badge>
                          <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
                        </div>
                      </div>
                    </Link>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!n.is_read && (
                          <DropdownMenuItem onClick={() => markRead.mutate(n.id)}>
                            <CheckCheck /> Mark as read
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setArchivedMut.mutate({ id: n.id, archived: !n.is_archived })}>
                          {n.is_archived ? <><ArchiveRestore /> Unarchive</> : <><Archive /> Archive</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={async () => {
                            try {
                              await del.mutateAsync(n.id)
                              toast.success('Notification deleted')
                            } catch (err) {
                              toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
                            }
                          }}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                )
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages} ({total} notifications)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            {archived ? 'No archived notifications.' : 'No notifications match your filters.'}
          </p>
        )}
      </Card>
    </div>
  )
}

function Toggle({ checked, onChange, disabled, label, hint, icon: Icon }: {
  checked: boolean
  onChange: (b: boolean) => void
  disabled?: boolean
  label: string
  hint: string
  icon: typeof BellIcon
}) {
  return (
    <label className={cn('flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <span>
          <span className="text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted', disabled && 'cursor-not-allowed')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function PreferencesTab() {
  const { profile } = useAuth()
  const userId = profile?.id ?? null
  const { data: prefs, isLoading } = useNotificationPreferences(userId)
  const update = useUpdateNotificationPreferences(userId)

  const toggleBrowser = async (next: boolean) => {
    if (next) {
      const permission = await requestBrowserPushPermission()
      if (permission !== 'granted') {
        toast.error('Browser permission denied', { description: 'Allow notifications for this site in your browser settings, then try again.' })
        return
      }
    }
    update.mutate({ browser_enabled: next })
  }

  if (isLoading || !prefs) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
  }

  return (
    <Card className="max-w-xl space-y-3 p-6">
      <Toggle
        icon={BellIcon}
        label="In-app"
        hint="Show notifications in the bell and on this page."
        checked={prefs.in_app_enabled}
        onChange={(v) => update.mutate({ in_app_enabled: v })}
      />
      <Toggle
        icon={Smartphone}
        label="Browser"
        hint={isBrowserPushSupported() ? 'Get a desktop notification while this app is open in a tab.' : 'Not supported in this browser.'}
        checked={prefs.browser_enabled}
        disabled={!isBrowserPushSupported()}
        onChange={toggleBrowser}
      />
      <Toggle
        icon={Mail}
        label="Email"
        hint="Coming soon — arrives with the Email Notification Engine milestone."
        checked={prefs.email_enabled}
        disabled
        onChange={() => {}}
      />
      <Toggle
        icon={MessageSquare}
        label="SMS"
        hint="Future — no SMS provider is configured yet."
        checked={prefs.sms_enabled}
        disabled
        onChange={() => {}}
      />
    </Card>
  )
}

export function NotificationsPage() {
  const { isPlatformAdmin } = usePermissions()
  const { has } = usePermissions()
  const seesFirmWide = isPlatformAdmin || has('audit.read')
  const [tab, setTab] = React.useState<Tab>('Notifications')

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={seesFirmWide ? 'Everything relevant to you and your firm, in one place.' : 'Everything relevant to you, in one place.'}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2"><RemindersCard /></div>
        <div className="space-y-4 lg:col-span-3">
          <div className="flex gap-1 border-b border-border">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                  tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'Notifications' ? <NotificationsList /> : <PreferencesTab />}
        </div>
      </div>
    </div>
  )
}
