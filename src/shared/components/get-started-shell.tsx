import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Scale, Settings } from 'lucide-react'
import { APP } from '@/shared/config/env'
import { ThemeToggle } from '@/shared/components/theme-toggle'
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
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border/70 px-6 py-5">
        <Link to="/welcome" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="h-5 w-5" />
          </span>
          <p className="font-display text-lg font-semibold">{APP.product}</p>
        </Link>
        <ThemeToggle />
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
