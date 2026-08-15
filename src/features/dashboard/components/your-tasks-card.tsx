import * as React from 'react'
import { Link } from 'react-router-dom'
import { format, isSameDay } from 'date-fns'
import { CheckSquare, ListChecks } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useTasks } from '@/features/tasks/hooks/use-tasks'
import { TASK_PRIORITY_META, type TaskRow } from '@/features/tasks/types'
import { isMatterClosed } from '@/features/matters/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import type { TaskPriority } from '@/shared/types/database.types'

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const byPriority = (a: TaskRow, b: TaskRow) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]

interface Buckets {
  overdue: TaskRow[]
  dueToday: TaskRow[]
  dueTomorrow: TaskRow[]
  upcoming: TaskRow[]
  completed: TaskRow[]
}

function bucketTasks(tasks: TaskRow[]): Buckets {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const weekEnd = new Date(today)
  weekEnd.setDate(today.getDate() + 7)

  // A task on a matter that's since closed can't be completed anymore
  // (RLS blocks it, same as editing/deleting) — listing it under Overdue/
  // Due today implies it's still actionable when it no longer is.
  const incomplete = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && !(t.matter && isMatterClosed(t.matter.status)),
  )
  const completed = tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => new Date(b.completed_at ?? b.updated_at).getTime() - new Date(a.completed_at ?? a.updated_at).getTime())
    .slice(0, 3)

  const overdue: TaskRow[] = []
  const dueToday: TaskRow[] = []
  const dueTomorrow: TaskRow[] = []
  const upcoming: TaskRow[] = []

  for (const t of incomplete) {
    const d = new Date(t.due_date + 'T00:00:00')
    if (d < today) overdue.push(t)
    else if (isSameDay(d, today)) dueToday.push(t)
    else if (isSameDay(d, tomorrow)) dueTomorrow.push(t)
    else if (d > tomorrow && d <= weekEnd) upcoming.push(t)
  }

  return {
    overdue: overdue.sort(byPriority),
    dueToday: dueToday.sort(byPriority),
    dueTomorrow: dueTomorrow.sort(byPriority),
    upcoming: upcoming.sort(byPriority),
    completed,
  }
}

function TaskRowItem({ task }: { task: TaskRow }) {
  const meta = TASK_PRIORITY_META[task.priority]
  const emphasize = task.priority === 'urgent' || task.priority === 'high'
  const to = task.matter ? `/matters/${task.matter.id}` : '/tasks'
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 hover:border-primary/40',
        emphasize ? cn('border-l-4', task.priority === 'urgent' ? 'border-l-destructive' : 'border-l-warning') : 'border-border',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{task.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {task.matter ? task.matter.matter_number : 'No matter'}
          {task.due_date ? ` · ${format(new Date(task.due_date + 'T00:00:00'), 'MMM d')}` : ''}
        </span>
      </span>
      <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
    </Link>
  )
}

function Section({ label, tasks }: { label: string; tasks: TaskRow[] }) {
  if (tasks.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label} ({tasks.length})</p>
      <div className="space-y-1.5">
        {tasks.map((t) => <TaskRowItem key={t.id} task={t} />)}
      </div>
    </div>
  )
}

/** Dashboard's dedicated task hub (spec §12) — the signed-in user's own
 * assigned, incomplete tasks bucketed by deadline, urgent/high rows visually
 * emphasized to match TASK_PRIORITY_META's language used everywhere else. */
export function YourTasksCard() {
  const { activeOrgId, profile } = useAuth()
  const { data, isLoading } = useTasks(activeOrgId, { status: 'all', assigneeId: 'me' }, profile?.id ?? null)
  const buckets = React.useMemo(() => bucketTasks(data ?? []), [data])
  const totalOpen = buckets.overdue.length + buckets.dueToday.length + buckets.dueTomorrow.length + buckets.upcoming.length

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Your tasks</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Assigned to you, by deadline</p>
        </div>
        <ListChecks className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : totalOpen === 0 && buckets.completed.length === 0 ? (
          <div className="py-10 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <CheckSquare className="h-6 w-6" />
            </span>
            <p className="text-sm font-medium">You're all caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">Tasks assigned to you will show up here, bucketed by deadline.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <Section label="Overdue" tasks={buckets.overdue} />
            <Section label="Due today" tasks={buckets.dueToday} />
            <Section label="Due tomorrow" tasks={buckets.dueTomorrow} />
            <Section label="Upcoming (7 days)" tasks={buckets.upcoming} />
            <Section label="Recently completed" tasks={buckets.completed} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
