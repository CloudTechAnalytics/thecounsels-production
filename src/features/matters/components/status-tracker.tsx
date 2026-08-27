import { Check, Trophy, X } from 'lucide-react'
import { MATTER_LIFECYCLE, MATTER_STATUS_META } from '@/features/matters/types'
import type { MatterStatus } from '@/shared/types/database.types'
import { cn } from '@/shared/lib/utils'

export function StatusTracker({ status }: { status: MatterStatus }) {
  const terminal = status === 'won' || status === 'lost'
  // Legacy 'pending' matters track exactly where 'in_court' would sit —
  // Pending and In Court were retired into a single step.
  const normalized = status === 'pending' ? 'in_court' : status
  const currentIndex = terminal ? MATTER_LIFECYCLE.length : MATTER_LIFECYCLE.indexOf(normalized)

  const steps = MATTER_LIFECYCLE.map((s) => ({ key: s, label: MATTER_STATUS_META[s].label }))
  if (terminal) {
    steps[steps.length - 1] = { key: status, label: MATTER_STATUS_META[status].label }
  }

  // Portrait/vertical, not the original horizontal row — with 6 stages
  // now (0147's under_review/resolved additions) a horizontal tracker
  // crowds the narrow sidebar cards both call sites live in (Overview's
  // Progress card, the Timeline's Status tracker card); stacking top-to-
  // bottom gives every label its own full-width line instead of fighting
  // for space along one cramped row.
  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex || (terminal && i === steps.length - 1)
        const isWon = terminal && i === steps.length - 1 && status === 'won'
        const isLost = terminal && i === steps.length - 1 && status === 'lost'
        const Icon = isWon ? Trophy : isLost ? X : Check
        const isLast = i === steps.length - 1
        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  isLost
                    ? 'border-destructive bg-destructive text-destructive-foreground'
                    : done || active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground',
                )}
              >
                {done || active ? <Icon className="h-4 w-4" /> : i + 1}
              </span>
              {!isLast && <div className={cn('my-1 w-0.5 flex-1', i < currentIndex ? 'bg-primary' : 'bg-border')} />}
            </div>
            <span className={cn('pt-1.5 text-sm', !isLast && 'pb-6', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
