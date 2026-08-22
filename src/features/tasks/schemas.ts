import { z } from 'zod'

export const taskSchema = z.object({
  title: z.string().min(2, 'Enter a task title'),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  assigneeId: z.string().optional(),
  matterId: z.string().optional(),
  dueDate: z.string().optional(),
  branchId: z.string().optional(),
})

export type TaskFormValues = z.infer<typeof taskSchema>
