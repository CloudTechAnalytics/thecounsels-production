import { Link } from 'react-router-dom'
import { differenceInCalendarDays } from 'date-fns'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { useSubscription } from '@/features/administration/hooks/use-administration'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import type { BadgeProps } from '@/shared/components/ui/badge'

/**
 * Live-rendered subscription status, always accurate (unlike the
 * threshold-crossing reminder notifications, which only fire once per
 * threshold) — the exact per-status wording from the commercial-model spec.
 */
export function SubscriptionStatusBanner({ organizationId }: { organizationId: string | null }) {
  const { data: sub } = useSubscription(organizationId)
  const { has } = usePermissions()

  if (!sub || !sub.plan) return null

  const planName = sub.plan.name
  let label: string
  let variant: BadgeProps['variant'] = 'muted'
  let showUpgradeCta = false

  switch (sub.status) {
    case 'trialing': {
      const days = sub.trial_ends_at ? Math.max(0, differenceInCalendarDays(new Date(sub.trial_ends_at), new Date())) : 0
      label = `${planName} Trial · ${days} day${days === 1 ? '' : 's'} remaining`
      variant = days <= 3 ? 'destructive' : days <= 7 ? 'warning' : 'secondary'
      showUpgradeCta = days <= 7
      break
    }
    case 'active':
      label = `${planName} · Active`
      variant = 'success'
      break
    case 'past_due':
      label = `${planName} · Payment required`
      variant = 'destructive'
      showUpgradeCta = true
      break
    case 'cancelled':
      label = `${planName} · Cancelled`
      variant = 'muted'
      break
    case 'suspended':
      label = `${planName} · Suspended`
      variant = 'destructive'
      showUpgradeCta = true
      break
    case 'expired':
      label = 'Trial expired · Choose a plan'
      variant = 'destructive'
      showUpgradeCta = true
      break
    case 'paused':
      label = `${planName} · Paused`
      variant = 'muted'
      showUpgradeCta = true
      break
    default:
      return null
  }

  // Only leadership (organization.manage) sees the action button — everyone
  // else just sees the status, matching the "no billing administration for
  // Senior Associates" rule.
  return (
    <Card className="mb-6 flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-2.5">
        {sub.status === 'trialing' ? <Sparkles className="h-4 w-4 text-primary" /> : <AlertTriangle className={showUpgradeCta ? 'h-4 w-4 text-destructive' : 'hidden'} />}
        <Badge variant={variant}>{label}</Badge>
      </div>
      {showUpgradeCta && has('organization.manage') && (
        <Button asChild size="sm" variant="outline">
          <Link to="/administration">{sub.status === 'trialing' ? 'Upgrade plan' : 'Manage billing'}</Link>
        </Button>
      )}
    </Card>
  )
}
