import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { APP } from '@/shared/config/env'
import { Button } from '@/shared/components/ui/button'
import { Sentry } from '@/app/sentry'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level crash barrier. Without this, an uncaught render error anywhere
 * in the tree unmounts React entirely and leaves the user on a blank white
 * page with no way back except guessing to hit refresh — exactly the kind
 * of thing that turns one bug into a support ticket instead of a Sentry
 * alert. Reports to Sentry (a no-op without VITE_SENTRY_DSN) and offers a
 * reload instead of a dead page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-display text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {APP.product} hit an unexpected error. It's been reported — reloading usually fixes it.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>
          <RotateCcw className="h-4 w-4" /> Reload
        </Button>
      </div>
    )
  }
}
