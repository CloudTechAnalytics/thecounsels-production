import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Matter, Profile, Task, TaskPriority, TaskStatus } from '@/shared/types/database.types'

export interface TaskRow extends Task {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; variant: BadgeProps['variant'] }> = {
  todo: { label: 'To do', variant: 'muted' },
  in_progress: { label: 'In progress', variant: 'default' },
  done: { label: 'Done', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'outline' },
}

export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; variant: BadgeProps['variant'] }> = {
  low: { label: 'Low', variant: 'muted' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'warning' },
  urgent: { label: 'Urgent', variant: 'destructive' },
}

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done', 'cancelled']
