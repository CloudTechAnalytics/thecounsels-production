import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
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
}: {
  label: string
  value: string
  /** For plain integer counts only — animates 0 → countTo on mount instead of rendering `value` directly. */
  countTo?: number
  hint?: string
  icon: LucideIcon
  trend?: { direction: 'up' | 'down'; value: string }
  loading?: boolean
}) {
  const animated = useCountUp(countTo ?? 0)

  return (
    <Card className="p-5">
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
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  )
}
