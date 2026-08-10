import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { env } from '@/shared/config/env'

// Browsers put no timeout on fetch() by default — a stalled connection
// (bad env vars pointing nowhere real, a paused Supabase project, a
// network path that never responds) hangs forever, and every query built
// on top of it (react-query, the auth bootstrap, everything) hangs right
// along with it. This is the one place ALL Supabase traffic — Postgrest,
// Auth, Storage, Realtime's HTTP calls — actually goes out over the wire,
// so bounding it here bounds every call in the app at once, instead of
// needing a timeout bolted onto each individual hook/query.
const FETCH_TIMEOUT_MS = 20_000

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  // Respect a caller-supplied signal (Supabase does pass one in places) —
  // abort ours the moment theirs does, so we never hold a request open
  // longer than the caller itself wanted.
  if (init.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

// A `code` (or `token_hash`) query param on the very first page load only
// ever comes from clicking a Supabase Auth email link — signup
// confirmation, invite, password recovery, magic link. This app's own
// sign-in form never produces one (it calls signInWithPassword directly,
// no redirect involved). Captured once, synchronously, right here — before
// the client below is even constructed, let alone gets a chance to run its
// async detectSessionInUrl and strip the param — so it's reliable no
// matter which page the email link actually lands the browser on. See
// auth-provider.tsx for how this is used to catch a just-verified session
// globally, regardless of route.
export const hadAuthRedirectInUrl = /[?&](code|token_hash)=/.test(window.location.href)

/**
 * Singleton, fully-typed Supabase client. This is the ONLY backend in the app —
 * PostgreSQL, Auth, Storage, and Realtime are all reached through it, with
 * Row Level Security enforcing multi-tenant isolation.
 *
 * When credentials are absent (fresh checkout, no .env.local) we still create a
 * client against a placeholder so the UI can render; any network call will fail
 * clearly and `env.isSupabaseConfigured` lets the app show a setup notice.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      fetch: fetchWithTimeout,
    },
  },
)

export type { Database }
