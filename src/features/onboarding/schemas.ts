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

/** Who's actually filling out this form — most self-service registrants
 * turn out to be IT/office staff setting the account up on the firm's
 * behalf, not the Managing Partner personally. Determines the role their
 * own membership gets (see register_organization, migration 0154) instead
 * of unconditionally making every registrant Managing Partner — they keep
 * account ownership either way, just not case-content access they were
 * never meant to have. Required, no default — a deliberate choice, not a
 * silent assumption.
 *
 * Deliberately limited to the two system roles that actually carry
 * members.manage — HR/Finance/Secretary only have members.view, so a
 * registrant picking one of those got stuck unable to invite anyone,
 * including the real Managing Partner. See registrant-role permission gap. */
export const REGISTRANT_ROLES = [
  { value: 'managing_partner', label: 'Managing Partner', hint: "I'm the firm's decision-maker, signing up directly." },
  { value: 'it_administrator', label: 'IT', hint: "I'm setting this up on the firm's behalf — I'll get IT access, and can invite the Managing Partner right after." },
] as const
export type RegistrantRole = (typeof REGISTRANT_ROLES)[number]['value']

/** Step 2 — "Tell us about your firm." Only name/short name/country/timezone/registrantRole are required. */
export const firmSetupSchema = z.object({
  registrantRole: z.enum(['managing_partner', 'it_administrator'], {
    required_error: 'Let us know who you are',
  }),
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
