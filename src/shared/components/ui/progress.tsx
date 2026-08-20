import { cn } from '@/shared/lib/utils'

/**
 * Simple percentage bar — no Radix primitive needed for a read-only meter.
 * `tone` picks the fill color; when omitted it's derived from `value`
 * itself using the same 75/90/100 thresholds the storage quota UI reasons
 * about elsewhere, so callers that don't care can just pass a percentage.
 */
export function Progress({
  value,
  tone,
  className,
}: {
  value: number
  tone?: 'success' | 'warning' | 'destructive'
  className?: string
}) {
  const pct = Math.min(100, Math.max(0, value))
  const resolvedTone = tone ?? (pct >= 100 ? 'destructive' : pct >= 90 ? 'destructive' : pct >= 75 ? 'warning' : 'success')
  const fill =
    resolvedTone === 'destructive' ? 'bg-destructive' : resolvedTone === 'warning' ? 'bg-warning' : 'bg-success'

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${pct}%` }} />
    </div>
  )
}
