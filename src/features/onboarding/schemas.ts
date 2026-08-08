import { z } from 'zod'

export const USER_COUNT_BANDS = ['1–5', '6–15', '16–30', '31+'] as const

/** Step 2 — "Tell us about your firm." Only name/country/timezone are required. */
export const firmSetupSchema = z.object({
  firmName: z.string().min(2, 'Enter your firm name'),
  legalName: z.string().optional(),
  country: z.string().min(1, 'Select your country'),
  timezone: z.string().min(1, 'Select your timezone'),
  website: z.string().optional(),
  industry: z.string().optional(),
  userCount: z.enum(USER_COUNT_BANDS).optional(),
  practiceAreas: z.array(z.string()).default([]),
})
export type FirmSetupValues = z.infer<typeof firmSetupSchema>
