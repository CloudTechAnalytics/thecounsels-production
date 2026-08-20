import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { taskCommentsService } from '@/features/tasks/services/task-comments.service'

export function useTaskComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-comments', taskId],
    enabled: Boolean(taskId),
    queryFn: () => taskCommentsService.list(taskId!),
  })
}

export function useAddTaskComment(taskId: string | undefined, organizationId: string | null, userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => taskCommentsService.add(taskId!, organizationId!, userId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', taskId] }),
  })
}
