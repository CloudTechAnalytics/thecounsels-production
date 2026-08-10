import * as React from 'react'
import { env } from '@/shared/config/env'

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

let scriptPromise: Promise<void> | null = null
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://challenge.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load the security check. Please reload and try again.'))
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/**
 * Cloudflare Turnstile — Supabase's own officially-supported CAPTCHA
 * provider for Auth (Authentication → Settings → "Enable CAPTCHA
 * protection" in the Supabase dashboard). Renders nothing at all, and
 * `onToken` is simply never called, when VITE_TURNSTILE_SITE_KEY isn't
 * set — every form using this behaves exactly as it did before until it's
 * actually configured on both sides (this site key here, the matching
 * secret key in Supabase's own settings).
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const widgetId = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!env.isTurnstileConfigured || !ref.current) return
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: env.turnstileSiteKey,
          callback: (token) => onToken(token),
          'error-callback': () => onToken(null),
          'expired-callback': () => onToken(null),
        })
      })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
    }
    // Widget is rendered once per mount; onToken is stable enough via its
    // own closure — re-running this on every render identity change would
    // just re-mount the widget pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!env.isTurnstileConfigured) return null
  return <div ref={ref} className="flex justify-center" />
}
