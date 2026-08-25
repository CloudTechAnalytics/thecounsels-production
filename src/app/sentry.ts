import * as Sentry from '@sentry/react'

/**
 * Wires client-side error monitoring. A deliberate no-op when
 * VITE_SENTRY_DSN isn't set, so local dev and any environment without a DSN
 * configured behave exactly as before — nothing is initialized, nothing is
 * sent anywhere. Call once, as early as possible, from main.tsx.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    // VITE_APP_ENV lets Vercel's Production/Staging/Preview deployments (all
    // built the same way, so import.meta.env.MODE is 'production' for every
    // one of them) report as distinct Sentry environments. Falls back to
    // MODE for local `vite build` testing where the var isn't set.
    environment: import.meta.env.VITE_APP_ENV ?? import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    ignoreErrors: [
      // Benign browser noise, not app bugs — keep them out of the quota.
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  })
}

export { Sentry }
