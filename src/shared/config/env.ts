/**
 * Centralized, validated access to build-time environment variables.
 * Backend is entirely Supabase — only the project URL + anon key are needed.
 */
import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
})

const parsed = schema.safeParse(import.meta.env)

const raw = parsed.success ? parsed.data : {}

export const env = {
  supabaseUrl: raw.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY ?? '',
  /** True only when both Supabase credentials are present. */
  get isSupabaseConfigured(): boolean {
    return Boolean(this.supabaseUrl && this.supabaseAnonKey)
  },
} as const

export const APP = {
  brand: 'CloudTech Legal Suite',
  product: 'The Counsel',
  tagline: 'Enterprise Legal Practice Management',
  /** Used only for the onboarding wizard's cosmetic organization-handle preview — not a real domain/mailbox. */
  domain: 'thecounsel.app',
} as const
