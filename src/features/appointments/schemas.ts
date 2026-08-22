import { z } from 'zod'

export const appointmentSchema = z.object({
  clientId: z.string().optional(),
  matterId: z.string().optional(),
  title: z.string().min(2, 'Enter a title'),
  appointmentAt: z.string().min(1, 'Pick a date and time'),
  durationMinutes: z.coerce.number().int().positive().optional(),
  location: z.string().optional(),
  assignedToId: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled', 'no_show']),
  notes: z.string().optional(),
  branchId: z.string().optional(),
})

export type AppointmentFormValues = z.infer<typeof appointmentSchema>
