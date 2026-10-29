/**
 * Stand-in for '@/shared/lib/supabase' in the prerender (SSR) build only —
 * aliased in vite.config.ts. The real module reads window.location at import
 * time, and marketing pages never query the database while rendering (auth
 * and data calls all live in effects, which don't run on the server). Any
 * call that does slip through resolves to an empty result instead of throwing.
 */
import type { Database } from '@/shared/types/database.types'

const inert: unknown = new Proxy(function () {}, {
  get: (_t, prop) => (prop === 'then' ? undefined : inert),
  apply: () => inert,
})

export const supabase = inert as import('@supabase/supabase-js').SupabaseClient<Database>
export const hadAuthRedirectInUrl = false
export const isPasswordRecoveryUrl = false
export type { Database }
