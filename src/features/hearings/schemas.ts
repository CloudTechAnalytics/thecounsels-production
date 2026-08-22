import { z } from 'zod'

export const hearingSchema = z.object({
  matterId: z.string().optional(),
  title: z.string().min(2, 'Enter a title'),
  hearingAt: z.string().min(1, 'Pick a date and time'),
  type: z.enum(['mention', 'hearing', 'trial', 'ruling', 'motion', 'conference', 'other']),
  status: z.enum(['scheduled', 'adjourned', 'held', 'cancelled']),
  court: z.string().optional(),
  judge: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  outcome: z.string().optional(),
  branchId: z.string().optional(),
})

export type HearingFormValues = z.infer<typeof hearingSchema>
