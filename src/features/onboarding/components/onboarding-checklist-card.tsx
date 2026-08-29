import * as React from 'react'
import { Link } from 'react-router-dom'
import { Check, Circle, X } from 'lucide-react'
import { useOnboardingChecklist } from '@/features/onboarding/hooks/use-onboarding'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { Card } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'

const DISMISS_KEY = 'counsel.onboarding_checklist_dismissed'

/**
 * Lightweight, skippable "getting started" checklist (§11) — no forced
 * completion, no schema of its own. Every item is derived live from
 * existing counts, so it's always accurate and needs no state to maintain.
 * Each step is only shown to a user who could actually perform it — a role
 * without clients.create seeing "Add your first client" as a to-do is just
 * a dead end, not a real next step for them.
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
      <p className="font-display text-base font-semibold">Get started with The Counsel</p>
      <p className="mt-0.5 text-sm text-muted-foreground">A few quick steps to set your firm up for success.</p>
      <ul className="mt-4 space-y-2.5">
        {items.map((item) => {
          const content = (
            <span className={cn('flex items-center gap-2.5 text-sm', item.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {item.done ? <Check className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
              {item.label}
            </span>
          )
          return (
            <li key={item.label}>
              {!item.done && item.to ? (
                <Link to={item.to} className="hover:underline">{content}</Link>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
