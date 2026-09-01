import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'

/**
 * In-card empty state — icon + heading + description + optional CTA.
 * Same visual language as the full-page no-organization-state.tsx, scaled
 * down to live inside a Card instead of a whole viewport. Introduced
 * 2026-09-01 to replace bare "No X yet." muted text on a brand-new firm's
 * dashboard — real feedback was that an otherwise-empty dashboard (zeroed
 * KPI tiles, a couple of one-line empty states) read as sparse/personal
 * rather than like software with something to do next.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  /** Omit when there's genuinely nothing to do yet (e.g. an activity feed) — not every empty state needs a button. */
  action?: { label: string; to: string }
}) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>}
      {action && (
        <Button asChild size="sm" className="mt-4">
          <Link to={action.to}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}
