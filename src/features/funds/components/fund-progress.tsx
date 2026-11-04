import { Check, X } from 'lucide-react'
import { FUND_STAGES, fundStage } from '@/features/funds/lib/next-step'
import type { FundRequest } from '@/features/funds/types'
import { cn } from '@/shared/lib/utils'

/** Request → Approval → Payment → Retirement → Closed, with where this one is. */
export function FundProgress({ r, compact }: { r: Pick<FundRequest, 'status'>; compact?: boolean }) {
  const { index, stopped } = fundStage(r)
  if (compact) {
    return (
      <div className="flex items-center gap-1" aria-label={`Stage: ${FUND_STAGES[index]}`}>
        {FUND_STAGES.map((s, i) => (
          <span
            key={s}
            title={s}
            className={cn(
              'h-1.5 w-5 rounded-full',
              i < index || (i === index && r.status === 'closed') ? 'bg-success'
                : i === index ? (stopped ? 'bg-destructive' : 'bg-primary') : 'bg-muted',
            )}
          />
        ))}
      </div>
    )
  }
  return (
    <ol className="flex w-full items-start">
      {FUND_STAGES.map((s, i) => {
        const done = i < index || (i === index && r.status === 'closed')
        const current = i === index && !done
        return (
          <li key={s} className="flex flex-1 flex-col items-center gap-1 text-center">
            <div className="flex w-full items-center">
              <span className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : i <= index ? 'bg-success' : 'bg-muted')} />
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done && 'border-success bg-success text-success-foreground',
                  current && !stopped && 'border-primary bg-primary text-primary-foreground',
                  current && stopped && 'border-destructive bg-destructive text-destructive-foreground',
                  !done && !current && 'border-muted bg-background text-muted-foreground',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : current && stopped ? <X className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('h-0.5 flex-1', i === FUND_STAGES.length - 1 ? 'bg-transparent' : i < index ? 'bg-success' : 'bg-muted')} />
            </div>
            <span className={cn('text-[11px]', current ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}
