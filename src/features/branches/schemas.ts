import { z } from 'zod'

export const branchSchema = z.object({
  name: z.string().min(2, 'Enter a branch name'),
  code: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
})

export type BranchFormValues = z.infer<typeof branchSchema>
