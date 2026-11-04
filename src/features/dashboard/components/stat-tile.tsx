import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ArrowRight } from 'lucide-react'
import { useCountUp } from '@/shared/hooks/use-count-up'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

export function StatTile({
  label,
  value,
  countTo,
  hint,
  icon: Icon,
  trend,
  loading,
  to,
  emphasis,
}: {
  label: string
  value: string
  /** For plain integer counts only — animates 0 → countTo on mount instead of rendering `value` directly. */
  countTo?: number
  hint?: string
  icon: LucideIcon
  trend?: { direction: 'up' | 'down'; value: string }
  loading?: boolean
  /** Makes the whole tile a link, with an arrow, to where these numbers live. */
  to?: string
  /** Draws the eye — use for the one or two figures that need action. */
  emphasis?: boolean
}) {
  const animated = useCountUp(countTo ?? 0)

  const body = (
    <Card className={cn('h-full p-5 transition-colors', to && 'group-hover:border-primary/50', emphasis && 'border-primary/40 bg-primary/5')}>
      <div className="flex items-start justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
              trend.direction === 'up' ? 'bg-success/12 text-success' : 'bg-destructive/12 text-destructive',
            )}
          >
            {trend.direction === 'up' ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend.value}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-8 w-24" />
        ) : (
          <p className="mt-1 animate-in fade-in slide-in-from-bottom-1 font-display text-2xl font-semibold tracking-tight duration-500">
            {countTo != null ? animated.toLocaleString() : value}
          </p>
        )}
        <div className="mt-1 flex items-end justify-between gap-2">
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : <span />}
          {to && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </Card>
  )
  return to ? <Link to={to} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl" aria-label={`${label}: open`}>{body}</Link> : body
}
