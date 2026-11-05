import { Toaster as SonnerToaster, toast } from 'sonner'
import { useTheme } from '@/shared/context/theme-provider'

/** Branded toast host. Mounted once near the app root. Follows the app's
 * theme — without `theme`, Sonner styles its icons and close button for a
 * light background, and they vanish on dark cards. */
export function Toaster() {
  const { resolvedTheme } = useTheme()
  return (
    <SonnerToaster
      theme={resolvedTheme}
      position="top-right"
      closeButton
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-border/70 bg-card text-card-foreground shadow-elevated',
          title: 'text-sm font-semibold',
          description: 'text-sm text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          closeButton: '!border-border !bg-card !text-foreground hover:!bg-muted',
          icon: 'text-foreground',
          success: '[&_[data-icon]]:text-success',
          error: '[&_[data-icon]]:text-destructive',
          warning: '[&_[data-icon]]:text-warning',
          info: '[&_[data-icon]]:text-primary',
          loading: '[&_[data-icon]]:text-muted-foreground',
        },
      }}
    />
  )
}

export { toast }
