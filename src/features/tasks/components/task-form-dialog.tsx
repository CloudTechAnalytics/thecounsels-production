import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatters, useFirmMembers } from '@/features/matters/hooks/use-matters'
import { useCreateTask, useUpdateTask } from '@/features/tasks/hooks/use-tasks'
import { taskSchema, type TaskFormValues } from '@/features/tasks/schemas'
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_META, TASK_PRIORITY_META, type TaskRow } from '@/features/tasks/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { friendlyErrorMessage } from '@/shared/lib/errors'
import { isMatterClosed } from '@/features/matters/types'

const NONE = '__none__'

function toDefaults(task?: TaskRow | null, presetMatterId?: string): TaskFormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    assigneeId: task?.assignee_id ?? '',
    matterId: task?.matter_id ?? presetMatterId ?? '',
    dueDate: task?.due_date ?? '',
  }
}

export function TaskFormDialog({
  task,
  presetMatterId,
  open,
  onOpenChange,
}: {
  task?: TaskRow | null
  presetMatterId?: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const { data: allMatters } = useMatters(activeOrgId, {})
  // A closed matter is read-only — filing a new task under one would
  // always fail, so it's excluded from fresh selection. Editing an
  // existing task whose matter is already closed still shows that matter
  // (it just can't be picked for a different, closed one).
  const matters = React.useMemo(
    () => (allMatters ?? []).filter((m) => !isMatterClosed(m.status) || m.id === task?.matter_id),
    [allMatters, task?.matter_id],
  )
  const { data: members } = useFirmMembers(activeOrgId)
  const create = useCreateTask(activeOrgId, profile?.id ?? null)
  const update = useUpdateTask(activeOrgId)

  const form = useForm<TaskFormValues>({ resolver: zodResolver(taskSchema), defaultValues: toDefaults(task) })
  React.useEffect(() => {
    if (open) form.reset(toDefaults(task, presetMatterId))
  }, [open, task, presetMatterId, form])

  const onSubmit = async (values: TaskFormValues) => {
    const clean = {
      ...values,
      assigneeId: values.assigneeId === NONE ? '' : values.assigneeId,
      matterId: values.matterId === NONE ? '' : values.matterId,
    }
    try {
      if (task) await update.mutateAsync({ id: task.id, values: clean })
      else await create.mutateAsync(clean)
      toast.success(task ? 'Task updated' : 'Task created')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save task', { description: friendlyErrorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
          <DialogDescription>Assign work, set a due date and track it to completion.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Task</FormLabel>
                  <FormControl>
                    <Input placeholder="Draft response to motion" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_META[s].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TASK_PRIORITY_META[p].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignee</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {members?.map((m) => (
                          <SelectItem key={m.id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="matterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="No matter" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No matter</SelectItem>
                        {matters?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {task ? 'Save changes' : 'Create task'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
