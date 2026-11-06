import type { OrgRow } from '@/features/platform/types'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { daysUntil } from '@/shared/lib/format'

/** The one status a platform admin needs to see for a firm: suspended wins,
 * otherwise the SUBSCRIPTION's real state (organizations.status is set at
 * creation and isn't kept in step — it said "trial" for firms whose trial
 * had expired weeks earlier). */
export function subscriptionStatus(org: OrgRow): { label: string; variant: BadgeProps['variant']; locked: boolean } {
  if (org.status === 'suspended') return { label: 'Suspended', variant: 'destructive', locked: true }
  const s = org.subscription
  if (!s) return { label: 'No subscription', variant: 'muted', locked: false }
  switch (s.status) {
    case 'active': return { label: 'Active', variant: 'success', locked: false }
    case 'trialing': {
      const d = daysUntil(s.trial_ends_at)
      if (d == null) return { label: 'Trial', variant: 'warning', locked: false }
      if (d < 0) return { label: 'Trial ended', variant: 'destructive', locked: false }
      return { label: `Trial · ${d}d left`, variant: d <= 3 ? 'destructive' : 'warning', locked: false }
    }
    case 'expired': return { label: 'Expired — locked out', variant: 'destructive', locked: true }
    case 'past_due': return { label: 'Payment overdue', variant: 'destructive', locked: false }
    case 'awaiting_payment': return { label: 'Awaiting payment — locked out', variant: 'warning', locked: true }
    case 'paused': return { label: 'Paused — locked out', variant: 'muted', locked: true }
    case 'cancelled': return { label: 'Cancelled', variant: 'muted', locked: false }
    default: return { label: String(s.status), variant: 'muted', locked: false }
  }
}

export function SubscriptionStatusBadge({ org }: { org: OrgRow }) {
  const st = subscriptionStatus(org)
  return <Badge variant={st.variant} title={st.locked ? 'Members of this firm cannot use the workspace' : undefined}>{st.label}</Badge>
}
