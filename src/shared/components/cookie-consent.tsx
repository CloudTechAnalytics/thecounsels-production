import { Button } from '@/shared/components/ui/button'
import { setConsent, useConsentPrompt } from '@/shared/lib/analytics'

/** Analytics consent bar — only ever shown on public marketing pages (see analytics.ts). */
export function CookieConsent() {
  const show = useConsentPrompt()
  if (!show) return null
  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-xl border border-border bg-card p-4 text-card-foreground shadow-lg sm:flex sm:items-center sm:gap-4"
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        We use analytics cookies to understand how visitors use our website, never inside the app or on
        your firm's data. See our{' '}
        <a href="/privacy" className="font-medium text-primary hover:underline">
          Privacy Policy
        </a>
        .
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <Button variant="outline" size="sm" onClick={() => setConsent('denied')}>
          Decline
        </Button>
        <Button size="sm" onClick={() => setConsent('granted')}>
          Accept
        </Button>
      </div>
    </div>
  )
}
