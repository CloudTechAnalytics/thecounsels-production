import { Link } from 'react-router-dom'
import { differenceInCalendarDays } from 'date-fns'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSubscription } from '@/features/administration/hooks/use-administration'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { Badge } from '@/shared/components/ui/badge'
import type { BadgeProps } from '@/shared/components/ui/badge'

/**
 * Compact, always-accurate subscription status pill — lives in the topbar
 * beside the theme toggle, notifications, and profile menu, rather than a
 * full-width dashboard banner. Clickable straight to Plan & Billing
 * (organization.manage holders only) whenever the status needs action.
 */
export function SubscriptionStatusPill() {
  const { activeOrgId } = useAuth()
  const { data: sub } = useSubscription(activeOrgId)
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

  const pill = (
    <Badge variant={variant} className="hidden items-center gap-1 whitespace-nowrap md:inline-flex">
      {sub.status === 'trialing' && <Sparkles className="h-3 w-3" />}
      {label}
    </Badge>
  )

  // Only leadership (organization.manage) can act on it — everyone else
  // just sees the status, matching the "no billing administration for
  // Senior Associates" rule. Non-actionable statuses render as a plain,
  // unclickable badge.
  if (showUpgradeCta && has('organization.manage')) {
    return (
      <Link to="/administration" className="transition-opacity hover:opacity-80" aria-label={`${label} — manage billing`}>
        {pill}
      </Link>
    )
  }
  return pill
}
