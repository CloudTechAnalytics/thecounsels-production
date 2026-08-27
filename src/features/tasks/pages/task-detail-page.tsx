import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useTask, useDeleteTask, useSetTaskStatus } from '@/features/tasks/hooks/use-tasks'
import { TaskFormDialog } from '@/features/tasks/components/task-form-dialog'
import { TaskCommentsPanel } from '@/features/tasks/components/task-comments-panel'
import { TASK_PRIORITY_META, TASK_STATUS_META, TASK_STATUSES } from '@/features/tasks/types'
import { isMatterClosed } from '@/features/matters/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { StatusBadgeMenu } from '@/shared/components/status-badge-menu'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { initialsOf } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'

/** No tabs, unlike MatterDetailPage — a task is a small entity, so one
 * screen (info card + reply thread) is enough. */
export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const { data: task, isLoading } = useTask(id)
  const del = useDeleteTask(activeOrgId)
  const setStatus = useSetTaskStatus(activeOrgId)

  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />
  if (!task) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <p className="font-display text-xl font-semibold">Task not found</p>
        <p className="mt-2 text-sm text-muted-foreground">It may have been deleted, or you don't have access to it.</p>
        <Button asChild className="mt-4" variant="outline"><Link to="/tasks">Back to Tasks</Link></Button>
      </div>
    )
  }

  const readOnly = Boolean(task.matter && isMatterClosed(task.matter.status))
  // Same split as the task list (0139): editing/completing someone else's
  // task needs tasks.assign; the assignee can always edit/complete their own.
  const canEdit = (has('tasks.assign') || task.assignee_id === profile?.id) && !readOnly

  const doDelete = async () => {
    try {
      await del.mutateAsync(task.id)
      toast.success('Task deleted')
      navigate('/tasks')
    } catch (err) {
      toast.error('Could not delete task', { description: errorMessage(err) })
    }
  }

  return (
    <div>
      <Link to="/tasks" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Tasks
      </Link>

      <PageHeader
        title={task.title}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
            )}
            {has('tasks.delete') && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={TASK_PRIORITY_META[task.priority].variant}>{TASK_PRIORITY_META[task.priority].label}</Badge>
            <StatusBadgeMenu
              value={task.status}
              options={TASK_STATUSES}
              meta={TASK_STATUS_META}
              disabled={!canEdit}
              onChange={(status) =>
                setStatus.mutate(
                  { id: task.id, status },
                  { onError: (err) => toast.error('Could not update task', { description: errorMessage(err) }) },
                )
              }
            />
          </div>
          {task.description && <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>}
          {readOnly && (
            <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              This task is on a closed matter — read-only.
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-6 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Due</span>
            <span className="font-medium">{task.due_date ? format(new Date(task.due_date + 'T00:00:00'), 'PP') : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Matter</span>
            {task.matter ? (
              <Link to={`/matters/${task.matter.id}`} className="font-medium text-primary hover:underline">{task.matter.matter_number}</Link>
            ) : (
              <span className="font-medium">—</span>
            )}
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Assignee</span>
            <span className="flex items-center gap-1.5 font-medium">
              {task.assignee ? (
                <>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-[9px] font-semibold text-primary">
                    {initialsOf(task.assignee.full_name, 'U')}
                  </span>
                  {task.assignee.full_name}
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
        </Card>

        <div className="lg:col-span-3">
          <TaskCommentsPanel taskId={task.id} organizationId={activeOrgId} readOnly={readOnly} />
        </div>
      </div>

      <TaskFormDialog task={task} open={editOpen} onOpenChange={setEditOpen} />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete task"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={`This permanently deletes "${task.title}". This can't be undone.`}
        onConfirm={doDelete}
      />
    </div>
  )
}
