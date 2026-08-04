import { z } from 'zod'

// Billable work must be linked to a matter — invoices find work through
// matters, so a matterless billable entry could never be billed to anyone.
export const timeEntrySchema = z
  .object({
    matterId: z.string().optional(),
    workDate: z.string().min(1, 'Pick a date'),
    hours: z.coerce.number().positive('Enter hours worked'),
    rate: z.coerce.number().min(0, 'Enter a rate'),
    description: z.string().min(2, 'Describe the work'),
    billable: z.boolean(),
    status: z.enum(['draft', 'submitted', 'approved']),
  })
  .refine((v) => !v.billable || Boolean(v.matterId), {
    message: 'Billable time must be linked to a matter',
    path: ['matterId'],
  })
export type TimeEntryFormValues = z.infer<typeof timeEntrySchema>

export const expenseSchema = z
  .object({
    matterId: z.string().optional(),
    expenseDate: z.string().min(1, 'Pick a date'),
    amount: z.coerce.number().min(0, 'Enter an amount'),
    description: z.string().min(2, 'Describe the expense'),
    category: z.string().optional(),
    billable: z.boolean(),
  })
  .refine((v) => !v.billable || Boolean(v.matterId), {
    message: 'Billable expenses must be linked to a matter',
    path: ['matterId'],
  })
export type ExpenseFormValues = z.infer<typeof expenseSchema>

export const generateInvoiceSchema = z.object({
  clientId: z.string().min(1, 'Choose a client'),
  matterId: z.string().optional(),
  dueDate: z.string().optional(),
  taxRate: z.coerce.number().min(0).max(100),
})
export type GenerateInvoiceFormValues = z.infer<typeof generateInvoiceSchema>

export const paymentSchema = z.object({
  amount: z.coerce.number().positive('Enter an amount'),
  method: z.string().optional(),
  reference: z.string().optional(),
  paidAt: z.string().min(1, 'Pick a date'),
})
export type PaymentFormValues = z.infer<typeof paymentSchema>
