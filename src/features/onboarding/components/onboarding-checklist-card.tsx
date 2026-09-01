import * as React from 'react'
import { Link } from 'react-router-dom'
import { Check, Circle, X } from 'lucide-react'
import { useOnboardingChecklist } from '@/features/onboarding/hooks/use-onboarding'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { Card } from '@/shared/components/ui/card'
import { Progress } from '@/shared/components/ui/progress'
import { cn } from '@/shared/lib/utils'

const DISMISS_KEY = 'counsel.onboarding_checklist_dismissed'

/**
 * Lightweight, skippable "getting started" tracker (§11) — no forced
 * completion, no schema of its own. Every item is derived live from
 * existing counts, so it's always accurate and needs no state to maintain.
 * Each step is only shown to a user who could actually perform it — a role
 * without clients.create seeing "Add your first client" as a to-do is just
 * a dead end, not a real next step for them.
 *
 * A progress bar + horizontal step chips (2026-09-01, real feedback) — the
 * original vertical checkbox list, first thing a brand-new firm saw on
 * their dashboard, read as a personal to-do list/diary rather than
 * software. Same steps, same completion logic, shaped like a setup
 * tracker instead.
 */
export function OnboardingChecklistCard({ organizationId }: { organizationId: string | null }) {
  const { data } = useOnboardingChecklist(organizationId)
  const { has } = usePermissions()
  const [dismissed, setDismissed] = React.useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  if (dismissed || !data) return null

  const items = [
    { label: 'Create your firm', done: true, to: null, visible: true },
    // Registration no longer assumes the registrant is the Managing
    // Partner (0154) — an org can genuinely have none yet (IT/HR/office
    // staff registered on the firm's behalf), which is a more specific,
    // more important gap than the generic "invite your team" wording
    // covers, so call it out directly while it's still true.
    data.hasManagingPartner
      ? { label: 'Invite your team', done: data.teamInvited, to: '/administration', visible: has('members.manage') }
      : { label: 'Invite your Managing Partner', done: false, to: '/administration', visible: has('members.manage') },
    { label: 'Add your first client', done: data.hasClient, to: '/clients', visible: has('clients.create') },
    { label: 'Create your first matter', done: data.hasMatter, to: '/matters', visible: has('matters.create') },
    { label: 'Create your first task', done: data.hasTask, to: '/tasks', visible: has('tasks.create') },
  ].filter((i) => i.visible)

  const allDone = items.length === 0 || items.every((i) => i.done)
  if (allDone) return null

  const doneCount = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <Card className="relative mb-6 p-5">
      <button
        onClick={dismiss}
        aria-label="Dismiss checklist"
        className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pr-6">
        <div>
          <p className="font-display text-base font-semibold">Get started with The Counsel</p>
          <p className="mt-0.5 text-sm text-muted-foreground">A few quick steps to set your firm up for success.</p>
        </div>
        <span className="shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
          {doneCount} of {items.length} done
        </span>
      </div>

      <Progress value={pct} tone="success" className="mt-4" />

      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => {
          const chip = (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                item.done
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-border text-foreground hover:border-primary/40 hover:bg-primary/5',
              )}
            >
              {item.done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground" />}
              {item.label}
            </span>
          )
          return !item.done && item.to ? (
            <Link key={item.label} to={item.to}>
              {chip}
            </Link>
          ) : (
            <React.Fragment key={item.label}>{chip}</React.Fragment>
          )
        })}
      </div>
    </Card>
  )
}
