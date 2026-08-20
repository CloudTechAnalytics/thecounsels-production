import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  addMonths,
  format,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, CheckSquare, Gavel } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useHearings } from '@/features/hearings/hooks/use-hearings'
import { HearingFormDialog } from '@/features/hearings/components/hearing-form-dialog'
import { HEARING_STATUS_META, type HearingRow } from '@/features/hearings/types'
import { isMatterClosed } from '@/features/matters/types'
import { useTasks } from '@/features/tasks/hooks/use-tasks'
import { TASK_STATUS_META, type TaskRow } from '@/features/tasks/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { toast } from '@/shared/components/ui/sonner'
import { cn } from '@/shared/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** A day cell's contents, merging hearings and task due dates into one sortable, renderable shape. */
type DayItem =
  | { kind: 'hearing'; id: string; time: string; title: string; sortKey: string; data: HearingRow }
  | { kind: 'task'; id: string; time: string; title: string; sortKey: string; data: TaskRow }

export function CalendarPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const navigate = useNavigate()
  const [cursor, setCursor] = React.useState(() => startOfMonth(new Date()))
  const [view, setView] = React.useState<'month' | 'agenda'>('month')
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<HearingRow | null>(null)
  const [presetDate, setPresetDate] = React.useState<string | undefined>()

  const gridStart = startOfWeek(startOfMonth(cursor))
  const gridEnd = endOfWeek(endOfMonth(cursor))
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const { data } = useHearings(activeOrgId, { from: gridStart.toISOString(), to: gridEnd.toISOString() })
  // Every open task with a due date — cheap enough for a firm's task volume,
  // and shares its cache with the Tasks page's own unfiltered query.
  const { data: taskData } = useTasks(activeOrgId, {}, userId)
  const canCreate = has('hearings.create')

  const byDay = React.useMemo(() => {
    const map = new Map<string, DayItem[]>()
    const push = (key: string, item: DayItem) => {
      const arr = map.get(key) ?? []
      arr.push(item)
      map.set(key, arr)
    }
    for (const h of data ?? []) {
      // Resolved hearings (held/cancelled) shouldn't linger on the calendar
      // — same "resolved work disappears" expectation tasks get below.
      if (h.status === 'held' || h.status === 'cancelled') continue
      const key = format(new Date(h.hearing_at), 'yyyy-MM-dd')
      push(key, { kind: 'hearing', id: h.id, time: format(new Date(h.hearing_at), 'HH:mm'), title: h.title, sortKey: h.hearing_at, data: h })
    }
    for (const t of taskData ?? []) {
      // due_date is a plain date (no time component) — every task due that
      // day sorts after the day's timed hearings, alphabetically among themselves.
      if (!t.due_date || t.status === 'cancelled' || t.status === 'done') continue
      push(t.due_date, { kind: 'task', id: t.id, time: '', title: t.title, sortKey: t.due_date + 'T23:59:59', data: t })
    }
    for (const items of map.values()) items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    return map
  }, [data, taskData])

  const openHearing = (h: HearingRow) => {
    // No leadership bypass on hearings once the matter is closed (unlike
    // the matter itself) — RLS blocks the save for everyone, so don't
    // even offer the edit form.
    if (h.matter && isMatterClosed(h.matter.status)) {
      toast.info('This hearing is on a closed matter and can no longer be edited.')
      return
    }
    setEditing(h)
    setPresetDate(undefined)
    setFormOpen(true)
  }
  // Tasks aren't editable from the calendar (no due-date-only edit surface
  // here) — clicking one takes you to the Tasks page instead, same as
  // clicking a notification about one would.
  const openTask = () => navigate('/tasks')
  const openNewOn = (day: Date) => {
    if (!canCreate) return
    setEditing(null)
    const at = new Date(day)
    at.setHours(9, 0, 0, 0)
    setPresetDate(at.toISOString())
    setFormOpen(true)
  }

  const monthItems = React.useMemo(() => {
    const items: DayItem[] = []
    for (const h of data ?? []) {
      if (h.status === 'held' || h.status === 'cancelled') continue
      if (!isSameMonth(new Date(h.hearing_at), cursor)) continue
      items.push({ kind: 'hearing', id: h.id, time: format(new Date(h.hearing_at), 'HH:mm'), title: h.title, sortKey: h.hearing_at, data: h })
    }
    for (const t of taskData ?? []) {
      if (!t.due_date || t.status === 'cancelled' || t.status === 'done') continue
      if (!isSameMonth(new Date(t.due_date + 'T00:00:00'), cursor)) continue
      items.push({ kind: 'task', id: t.id, time: '', title: t.title, sortKey: t.due_date + 'T23:59:59', data: t })
    }
    return items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }, [data, taskData, cursor])

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Every court date, appearance, and task due date across the firm."
        actions={
          canCreate ? (
            <Button onClick={() => { setEditing(null); setPresetDate(undefined); setFormOpen(true) }}>
              <Plus /> Schedule
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 font-display text-xl font-semibold">{format(cursor, 'MMMM yyyy')}</h2>
          <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {(['month', 'agenda'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors',
                view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd')
              const items = byDay.get(key) ?? []
              const inMonth = isSameMonth(day, cursor)
              return (
                <button
                  key={key}
                  onClick={() => openNewOn(day)}
                  className={cn(
                    'min-h-[104px] border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-muted/40',
                    !inMonth && 'bg-muted/20 text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      isToday(day) && 'bg-primary font-semibold text-primary-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  <div className="mt-1 space-y-1">
                    {items.slice(0, 3).map((item) => (
                      <div
                        key={`${item.kind}-${item.id}`}
                        onClick={(e) => { e.stopPropagation(); item.kind === 'hearing' ? openHearing(item.data) : openTask() }}
                        className={cn(
                          'flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                          item.kind === 'hearing'
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'bg-muted text-foreground hover:bg-muted/70',
                        )}
                      >
                        {item.kind === 'hearing' ? <Gavel className="h-3 w-3 shrink-0" /> : <CheckSquare className="h-3 w-3 shrink-0" />}
                        <span className="truncate">{item.time ? `${item.time} ` : ''}{item.title}</span>
                      </div>
                    ))}
                    {items.length > 3 && <p className="px-1 text-[11px] text-muted-foreground">+{items.length - 3} more</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {monthItems.length > 0 ? (
            monthItems.map((item) => {
              const isHearing = item.kind === 'hearing'
              const d = isHearing ? new Date(item.data.hearing_at) : new Date(item.data.due_date + 'T00:00:00')
              return (
                <Card
                  key={`${item.kind}-${item.id}`}
                  className="flex cursor-pointer items-center gap-4 p-3 hover:border-primary/40"
                  onClick={() => (isHearing ? openHearing(item.data) : openTask())}
                >
                  <div
                    className={cn(
                      'flex w-14 shrink-0 flex-col items-center rounded-lg py-1.5',
                      isHearing ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground',
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase">{format(d, 'EEE')}</span>
                    <span className="font-display text-lg font-semibold leading-none">{format(d, 'd')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {isHearing ? <Gavel className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <CheckSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isHearing
                        ? `${format(d, 'HH:mm')}${item.data.court ? ` · ${item.data.court}` : ''}`
                        : (item.data.matter?.title ?? 'No matter linked')}
                    </p>
                  </div>
                  {isHearing ? (
                    <Badge variant={HEARING_STATUS_META[item.data.status].variant}>{HEARING_STATUS_META[item.data.status].label}</Badge>
                  ) : (
                    <Badge variant={TASK_STATUS_META[item.data.status].variant}>{TASK_STATUS_META[item.data.status].label}</Badge>
                  )}
                </Card>
              )
            })
          ) : (
            <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nothing scheduled in {format(cursor, 'MMMM')}.</p>
            </Card>
          )}
        </div>
      )}

      <HearingFormDialog hearing={editing} presetDate={presetDate} open={formOpen} onOpenChange={setFormOpen} />
    </div>
  )
}
