import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tasksService, type TaskFilters } from '@/features/tasks/services/tasks.service'
import type { TaskFormValues } from '@/features/tasks/schemas'
import type { TaskStatus } from '@/shared/types/database.types'

export function useTasks(organizationId: string | null, filters: TaskFilters, currentUserId: string | null) {
  return useQuery({
    queryKey: ['tasks', organizationId, filters],
    enabled: Boolean(organizationId),
    queryFn: () => tasksService.list(organizationId!, filters, currentUserId),
  })
}

/** retry: false — same reasoning as useMatter(): don't keep retrying a
 * fetch that failed because access was revoked, or a stale cached success
 * would mask that. */
export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    enabled: Boolean(id),
    queryFn: () => tasksService.get(id!),
    retry: false,
  })
}

function useInvalidate(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['tasks', organizationId] })
    qc.invalidateQueries({ queryKey: ['matter-summary'] })
    qc.invalidateQueries({ queryKey: ['reports'] })
    // A newly (re)assigned task changes the assignee's "My open tasks"
    // dashboard stat and, since assignment can now grant matter access,
    // potentially their visible matters too.
    qc.invalidateQueries({ queryKey: ['billing', organizationId, 'personal-stats'] })
    qc.invalidateQueries({ queryKey: ['matters'] })
  }
}

export function useCreateTask(organizationId: string | null, createdBy: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: (values: TaskFormValues) => tasksService.create(organizationId!, values, createdBy),
    onSuccess: invalidate,
  })
}

export function useUpdateTask(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: TaskFormValues }) => tasksService.update(id, organizationId!, values),
    onSuccess: invalidate,
  })
}

export function useSetTaskStatus(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => tasksService.setStatus(id, organizationId!, status),
    onSuccess: invalidate,
  })
}

export function useDeleteTask(organizationId: string | null) {
  const invalidate = useInvalidate(organizationId)
  return useMutation({ mutationFn: (id: string) => tasksService.remove(id), onSuccess: invalidate })
}
