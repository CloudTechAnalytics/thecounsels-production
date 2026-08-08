import * as React from 'react'
import { Plus, CheckSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useTasks, useDeleteTask } from '@/features/tasks/hooks/use-tasks'
import { TaskFormDialog } from '@/features/tasks/components/task-form-dialog'
import { TaskItem } from '@/features/tasks/components/task-item'
import type { TaskRow } from '@/features/tasks/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'

export function MatterTasksPanel({ matterId, readOnly = false }: { matterId: string; readOnly?: boolean }) {
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const { data, isLoading } = useTasks(activeOrgId, { matterId, status: 'all', assigneeId: 'all' }, profile?.id ?? null)
  const del = useDeleteTask(activeOrgId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TaskRow | null>(null)
  const [toDelete, setToDelete] = React.useState<TaskRow | null>(null)

  const canCreate = has('tasks.create') && !readOnly
  const canEdit = has('tasks.update') && !readOnly
  const canDelete = has('tasks.delete') && !readOnly

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (t: TaskRow) => { setEditing(t); setFormOpen(true) }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={openNew}><Plus /> New task</Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              showMatter={false}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => openEdit(t)}
              onDelete={() => setToDelete(t)}
            />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <CheckSquare className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold">No tasks for this matter yet.</p>
          {canCreate && <Button onClick={openNew} size="sm" className="mt-1"><Plus /> New task</Button>}
        </Card>
      )}

      <TaskFormDialog task={editing} presetMatterId={matterId} open={formOpen} onOpenChange={setFormOpen} />

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
