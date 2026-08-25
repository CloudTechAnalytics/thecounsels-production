import { supabase } from '@/shared/lib/supabase'
import { Sentry } from '@/app/sentry'

const ACTIVE_ORG_KEY = 'counsel.active_org'

/**
 * Reports a client error two ways: Sentry (a no-op until VITE_SENTRY_DSN is
 * set — see src/app/sentry.ts) and an insert into client_error_logs
 * (migration 0120), which needs no vendor account and works today. Both are
 * best-effort — a failure logging the error must never throw and must
 * never recurse into this same handler.
 */
export function logClientError(
  error: unknown,
  extra?: { componentStack?: string; source?: string },
) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined

  Sentry.captureException(error, { extra })

  let organizationId: string | null = null
  try {
    organizationId = localStorage.getItem(ACTIVE_ORG_KEY)
  } catch {
    // localStorage can throw in a locked-down browser context — fine to skip.
  }

  supabase
    .from('client_error_logs')
    .insert({
      organization_id: organizationId,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      component_stack: extra?.componentStack?.slice(0, 8000),
      url: typeof window !== 'undefined' ? window.location.href.slice(0, 2000) : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
      environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
      context: extra?.source ? { source: extra.source } : null,
    })
    // Best-effort: a broken error-logger must never throw or loop back
    // into itself. Swallow silently rather than console.error-ing, which
    // some setups would otherwise re-trigger a window 'error' listener.
    .then(undefined, () => {})
}

let installed = false

/**
 * Catches whatever the React ErrorBoundary can't — errors thrown outside
 * a render (event handlers, timers, unhandled promise rejections). Call
 * once from main.tsx.
 */
export function installGlobalErrorLogging() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    logClientError(event.error ?? event.message, { source: 'window.onerror' })
  })

  window.addEventListener('unhandledrejection', (event) => {
    logClientError(event.reason, { source: 'unhandledrejection' })
  })
}
