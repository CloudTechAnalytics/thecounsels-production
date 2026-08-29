import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Settings } from 'lucide-react'
import { APP } from '@/shared/config/env'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { CounselMark } from '@/shared/components/counsel-mark'
import { cn } from '@/shared/lib/utils'

/**
 * Shared centered shell for the public "get started" journey — /auth/register
 * and /onboarding — visually distinct from AuthShell's split-screen brand
 * panel (kept as-is for login/forgot-password/reset-password/accept-invite,
 * the return-user flows). Gear-badge header, step title/subtitle, a thin
 * segmented progress bar, and an optional back control.
 */
export function GetStartedShell({
  title = 'Create Your Account',
  stepLabel,
  stepDescription,
  step,
  totalSteps,
  onBack,
  children,
  maxWidthClassName = 'max-w-lg',
  onLogoClick,
  headerEnd,
}: {
  title?: string
  stepLabel: string
  stepDescription?: string
  /** 0-indexed: how many segments are already complete. */
  step?: number
  totalSteps?: number
  onBack?: { label?: string; onClick: () => void }
  children: ReactNode
  /** Override the container width — e.g. a wide plan-selection grid needs more room than a name/email form. */
  maxWidthClassName?: string
  /** Override what the logo does — default is "go home" (Link to="/"). A page reachable only while
   * signed in but locked out of the workspace (e.g. a paused/suspended subscription) needs this: an
   * authenticated visitor to "/" doesn't see the landing page at all, they just get bounced straight
   * back to the same lock screen by RequireActiveSubscription — so the logo silently did nothing. Pass
   * a real handler (typically sign out, then navigate home) to make it actually go somewhere. */
  onLogoClick?: () => void
  /** Extra content in the header, before the theme toggle — e.g. a Sign out control on a page a
   * signed-in-but-locked-out user has no other way to leave. */
  headerEnd?: ReactNode
}) {
  const brand = (
    <>
      <CounselMark className="h-9 w-9" />
      <p className="font-display text-lg font-semibold">{APP.product}</p>
    </>
  )

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border/70 px-6 py-5">
        {onLogoClick ? (
          <button type="button" onClick={onLogoClick} className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            {brand}
          </button>
        ) : (
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            {brand}
          </Link>
        )}
        <div className="flex items-center gap-2">
          {headerEnd}
          <ThemeToggle />
        </div>
      </header>

      <div className={cn('mx-auto px-6 py-12', maxWidthClassName)}>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground">
            <Settings className="h-5 w-5" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm font-semibold">{stepLabel}</p>
          {stepDescription && <p className="text-xs text-muted-foreground">{stepDescription}</p>}
          {step != null && totalSteps != null && totalSteps > 1 && (
            <div className="mt-4 flex w-28 gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < step ? 'bg-primary' : 'bg-border')} />
              ))}
            </div>
          )}
        </div>

        {onBack && (
          <button
            type="button"
            onClick={onBack.onClick}
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> {onBack.label ?? 'Back'}
          </button>
        )}

        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}
