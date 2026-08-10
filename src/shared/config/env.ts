/**
 * Centralized, validated access to build-time environment variables.
 * Backend is entirely Supabase — only the project URL + anon key are needed.
 */
import { z } from 'zod'

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  // Paystack's PUBLIC key only — safe in the frontend bundle. The secret key
  // lives exclusively as an Edge Function secret (PAYSTACK_SECRET_KEY),
  // never referenced from src/.
  VITE_PAYSTACK_PUBLIC_KEY: z.string().min(1).optional(),
  // Cloudflare Turnstile SITE key — also safe in the frontend bundle (it's
  // meant to be public; only the secret key, pasted directly into Supabase's
  // own Auth settings, needs protecting, and this app never sees it).
  // Unset by default: forms render and submit exactly as before until this
  // is configured — see turnstile-widget.tsx.
  VITE_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
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
  paystackPublicKey: raw.VITE_PAYSTACK_PUBLIC_KEY ?? '',
  /** Whether checkout should even be attempted — the Edge Function is the real gate either way. */
  get isPaystackConfigured(): boolean {
    return Boolean(this.paystackPublicKey)
  },
  turnstileSiteKey: raw.VITE_TURNSTILE_SITE_KEY ?? '',
  get isTurnstileConfigured(): boolean {
    return Boolean(this.turnstileSiteKey)
  },
} as const

export const APP = {
  brand: 'CloudTech Legal Suite',
  product: 'The Counsel',
  tagline: 'Enterprise Legal Practice Management',
  /** Used only for the onboarding wizard's cosmetic organization-handle preview — not a real domain/mailbox. */
  domain: 'thecounsel.app',
  contactEmail: 'cloudtechanalytics.consultant@gmail.com',
} as const
