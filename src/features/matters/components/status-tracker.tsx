import * as React from 'react'
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

  return (
    <div className="flex items-center">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex || (terminal && i === steps.length - 1)
        const isWon = terminal && i === steps.length - 1 && status === 'won'
        const isLost = terminal && i === steps.length - 1 && status === 'lost'
        const Icon = isWon ? Trophy : isLost ? X : Check
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  isLost
                    ? 'border-destructive bg-destructive text-destructive-foreground'
                    : done || active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground',
                )}
              >
                {done || active ? <Icon className="h-4 w-4" /> : i + 1}
              </span>
              <span className={cn('text-xs', active ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-1 h-0.5 flex-1', i < currentIndex ? 'bg-primary' : 'bg-border')} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
