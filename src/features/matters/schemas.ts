import { z } from 'zod'

export const matterSchema = z.object({
  title: z.string().min(2, 'Enter a matter title'),
  clientId: z.string().optional(),
  practiceArea: z.string().optional(),
  status: z.enum(['open', 'pending', 'in_court', 'closed', 'won', 'lost', 'appeal', 'under_review', 'resolved']),
  priority: z.enum(['low', 'medium', 'high']),
  leadLawyerId: z.string().optional(),
  responsiblePartnerId: z.string().optional(),
  opposingCounsel: z.string().optional(),
  court: z.string().optional(),
  judge: z.string().optional(),
  description: z.string().optional(),
  branchId: z.string().optional(),
})

export type MatterFormValues = z.infer<typeof matterSchema>
