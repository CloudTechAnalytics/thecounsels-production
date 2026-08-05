import { z } from 'zod'

export const clientSchema = z
  .object({
    type: z.enum(['individual', 'corporate']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    companyName: z.string().optional(),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: z.string().optional(),
    contactName: z.string().optional(),
    contactTitle: z.string().optional(),
    contactEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
    contactPhone: z.string().optional(),
    website: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    status: z.enum(['active', 'inactive', 'prospect']),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'corporate' && !val.companyName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['companyName'], message: 'Enter the company name' })
    }
    if (val.type === 'individual' && !val.firstName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'Enter the first name' })
    }
  })

export type ClientFormValues = z.infer<typeof clientSchema>

export function clientDisplayName(v: Pick<ClientFormValues, 'type' | 'firstName' | 'lastName' | 'companyName'>): string {
  if (v.type === 'corporate') return v.companyName?.trim() || 'Unnamed company'
  return [v.firstName, v.lastName].filter(Boolean).join(' ').trim() || 'Unnamed client'
}
