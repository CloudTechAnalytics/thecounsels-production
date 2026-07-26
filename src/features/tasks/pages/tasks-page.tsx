import * as React from 'react'
import { Link } from 'react-router-dom'
import { format, isPast, isToday } from 'date-fns'
import { Plus, CheckSquare, Search, MoreHorizontal, Pencil, Trash2, Circle, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useTasks, useSetTaskStatus, useDeleteTask } from '@/features/tasks/hooks/use-tasks'
import { TaskFormDialog } from '@/features/tasks/components/task-form-dialog'
import { TASK_PRIORITY_META, TASK_STATUS_META, type TaskRow } from '@/features/tasks/types'
import type { TaskFilters } from '@/features/tasks/services/tasks.service'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

function DueLabel({ due, done }: { due: string; done: boolean }) {
  const d = new Date(due + 'T00:00:00')
  const overdue = !done && isPast(d) && !isToday(d)
  const today = isToday(d)
  return (
    <span className={cn('flex items-center gap-1 text-xs', overdue ? 'font-medium text-destructive' : today ? 'font-medium text-primary' : 'text-muted-foreground')}>
      <Clock className="h-3 w-3" />
      {overdue ? 'Overdue · ' : today ? 'Today · ' : ''}
      {format(d, 'MMM d')}
    </span>
  )
}

function TaskItem({ task, canEdit, canDelete, onEdit, onDelete }: {
  task: TaskRow
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { activeOrgId } = useAuth()
  const setStatus = useSetTaskStatus(activeOrgId)
  const done = task.status === 'done'

  return (
    <Card className="flex items-start gap-3 p-3">
      <button
        className="mt-0.5 text-muted-foreground hover:text-primary"
        onClick={() => setStatus.mutate({ id: task.id, status: done ? 'todo' : 'done' })}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>{task.title}</p>
          <Badge variant={TASK_PRIORITY_META[task.priority].variant}>{TASK_PRIORITY_META[task.priority].label}</Badge>
          {task.status !== 'done' && <Badge variant={TASK_STATUS_META[task.status].variant}>{TASK_STATUS_META[task.status].label}</Badge>}
        </div>
        {task.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {task.due_date && <DueLabel due={task.due_date} done={done} />}
          {task.matter && (
            <Link to={`/matters/${task.matter.id}`} className="text-xs text-primary hover:underline">{task.matter.matter_number}</Link>
          )}
          {task.assignee && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-[9px] font-semibold text-primary">
                {initialsOf(task.assignee.full_name, 'U')}
              </span>
              {task.assignee.full_name}
            </span>
          )}
        </div>
      </div>
      {(canEdit || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && <DropdownMenuItem onClick={onEdit}><Pencil /> Edit</DropdownMenuItem>}
            {canDelete && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 /> Delete</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Card>
  )
}

export function TasksPage() {
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<TaskFilters['status']>('all')
  const [scope, setScope] = React.useState<'all' | 'me'>('all')
  const { data, isLoading } = useTasks(activeOrgId, { search, status, assigneeId: scope }, profile?.id ?? null)
  const del = useDeleteTask(activeOrgId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TaskRow | null>(null)
  const [toDelete, setToDelete] = React.useState<TaskRow | null>(null)

  const canCreate = has('tasks.create')
  const canEdit = has('tasks.update')
  const canDelete = has('tasks.delete')

  const open = (data ?? []).filter((t) => t.status !== 'done')
  const done = (data ?? []).filter((t) => t.status === 'done')
  const overdue = open.filter((t) => t.due_date && isPast(new Date(t.due_date + 'T00:00:00')) && !isToday(new Date(t.due_date + 'T00:00:00')))

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (t: TaskRow) => { setEditing(t); setFormOpen(true) }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Assignments and deadlines across the firm."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="tasks"
              disabled={!data?.length}
              sheets={() => [{
                name: 'Tasks',
                rows: (data ?? []).map((t) => ({
                  Title: t.title,
                  Status: TASK_STATUS_META[t.status].label,
                  Priority: TASK_PRIORITY_META[t.priority].label,
                  Assignee: t.assignee?.full_name ?? '',
                  Matter: t.matter?.matter_number ?? '',
                  'Due date': t.due_date ?? '',
                  Description: t.description ?? '',
                })),
              }]}
            />
            {canCreate && <Button onClick={openNew}><Plus /> New task</Button>}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Open</p><p className="font-display text-2xl font-semibold">{open.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className="font-display text-2xl font-semibold text-destructive">{overdue.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="font-display text-2xl font-semibold text-success">{done.length}</p></Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="pl-9" />
        </div>
        <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'me')}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tasks</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as TaskFilters['status'])}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="todo">To do</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((t) => (
            <TaskItem key={t.id} task={t} canEdit={canEdit} canDelete={canDelete} onEdit={() => openEdit(t)} onDelete={() => setToDelete(t)} />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary"><CheckSquare className="h-7 w-7" /></span>
          <p className="font-display text-lg font-semibold">No tasks {scope === 'me' ? 'assigned to you' : 'yet'}</p>
          <p className="max-w-sm text-sm text-muted-foreground">Create tasks with due dates and assignees to keep work moving.</p>
          {canCreate && <Button onClick={openNew} className="mt-1"><Plus /> New task</Button>}
        </Card>
      )}

      <TaskFormDialog task={editing} open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete task"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This removes <strong>{toDelete?.title}</strong>.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync(toDelete.id)
            toast.success('Task deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
