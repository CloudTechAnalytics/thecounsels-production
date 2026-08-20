import { z } from 'zod'

export const USER_COUNT_BANDS = ['1–5', '6–15', '16–30', '31+'] as const

/** e.g. "CloudTech Legal Firm" -> "cloudtech-legal-firm". Same shape as platform/schemas.ts's slugify — kept
 *  local so onboarding doesn't reach into the platform feature for a one-line helper. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
}

/** Step 2 — "Tell us about your firm." Only name/short name/country/timezone are required. */
export const firmSetupSchema = z.object({
  firmName: z.string().min(2, 'Enter your firm name'),
  shortName: z
    .string()
    .min(2, 'Enter a short name')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  legalName: z.string().optional(),
  country: z.string().min(1, 'Select your country'),
  timezone: z.string().min(1, 'Select your timezone'),
  website: z.string().optional(),
  industry: z.string().optional(),
  userCount: z.enum(USER_COUNT_BANDS).optional(),
  practiceAreas: z.array(z.string()).default([]),
})
export type FirmSetupValues = z.infer<typeof firmSetupSchema>
