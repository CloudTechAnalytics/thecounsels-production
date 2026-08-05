import { z } from 'zod'
import { isValidPhone } from '@/shared/lib/phone'

const phoneField = z
  .string()
  .optional()
  .refine((v) => !v?.trim() || isValidPhone(v), 'Enter a valid phone number')

export const clientSchema = z
  .object({
    type: z.enum(['individual', 'corporate']),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    companyName: z.string().optional(),
    registrationNumber: z.string().optional(),
    email: z.string().email('Enter a valid email').optional().or(z.literal('')),
    phone: phoneField,
    // Only used when creating a client — one contact added alongside it.
    // Editing an existing client's contacts happens via "Manage contacts".
    contactName: z.string().optional(),
    contactTitle: z.string().optional(),
    contactEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
    contactPhone: phoneField,
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

export const contactSchema = z.object({
  name: z.string().min(1, 'Enter a name'),
  title: z.string().optional(),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  phone: phoneField,
})

export type ContactFormValues = z.infer<typeof contactSchema>
