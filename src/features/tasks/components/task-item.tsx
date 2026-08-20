import { Link, useNavigate } from 'react-router-dom'
import { format, isPast, isToday } from 'date-fns'
import { MoreHorizontal, Pencil, Trash2, Circle, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSetTaskStatus } from '@/features/tasks/hooks/use-tasks'
import { TASK_PRIORITY_META, TASK_STATUS_META, TASK_STATUSES, type TaskRow } from '@/features/tasks/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { StatusBadgeMenu } from '@/shared/components/status-badge-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import { initialsOf } from '@/shared/lib/format'

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

export function TaskItem({
  task,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  showMatter = true,
}: {
  task: TaskRow
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  showMatter?: boolean
}) {
  const { activeOrgId } = useAuth()
  const navigate = useNavigate()
  const setStatus = useSetTaskStatus(activeOrgId)
  const done = task.status === 'done'
  const emphasize = !done && (task.priority === 'urgent' || task.priority === 'high')

  return (
    <Card
      className={cn(
        'flex cursor-pointer items-start gap-3 p-3',
        emphasize && cn('border-l-4', task.priority === 'urgent' ? 'border-l-destructive' : 'border-l-warning'),
      )}
      onClick={() => navigate(`/tasks/${task.id}`)}
    >
      <button
        className="mt-0.5 text-muted-foreground hover:text-primary"
        onClick={(e) => {
          e.stopPropagation()
          setStatus.mutate({ id: task.id, status: done ? 'todo' : 'done' })
        }}
        aria-label={done ? 'Mark incomplete' : 'Mark complete'}
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>{task.title}</p>
          <Badge variant={TASK_PRIORITY_META[task.priority].variant}>{TASK_PRIORITY_META[task.priority].label}</Badge>
          <StatusBadgeMenu
            value={task.status}
            options={TASK_STATUSES}
            meta={TASK_STATUS_META}
            onChange={(status) => setStatus.mutate({ id: task.id, status })}
          />
        </div>
        {task.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {task.due_date && <DueLabel due={task.due_date} done={done} />}
          {showMatter && task.matter && (
            <Link to={`/matters/${task.matter.id}`} className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              {task.matter.matter_number}
            </Link>
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
            <Button variant="ghost" size="icon" aria-label="Actions" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
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
