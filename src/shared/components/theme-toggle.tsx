import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/shared/context/theme-provider'
import { cn } from '@/shared/lib/utils'

/**
 * Quick light/dark switch, available everywhere — landing page, auth/
 * onboarding screens, and the signed-in app shells — not just buried in
 * Settings (which keeps its full Light/Dark/System picker as-is). Clicking
 * always sets an explicit light or dark preference; it never lands on
 * 'system' since there's nothing to toggle "back" to.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className,
      )}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  )
}
