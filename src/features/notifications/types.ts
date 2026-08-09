import type { BadgeProps } from '@/shared/components/ui/badge'
import type { NotificationCategory, NotificationPriority, NotificationRow, Profile } from '@/shared/types/database.types'

export interface NotificationItem extends NotificationRow {
  actor: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export const NOTIFICATION_PRIORITY_META: Record<NotificationPriority, { label: string; variant: BadgeProps['variant'] }> = {
  info: { label: 'Info', variant: 'muted' },
  reminder: { label: 'Reminder', variant: 'secondary' },
  warning: { label: 'Warning', variant: 'warning' },
  urgent: { label: 'Urgent', variant: 'destructive' },
}

export const NOTIFICATION_CATEGORY_META: Record<NotificationCategory, { label: string }> = {
  matters: { label: 'Matters' },
  clients: { label: 'Clients' },
  hearings: { label: 'Hearings' },
  billing: { label: 'Billing' },
  tasks: { label: 'Tasks' },
  documents: { label: 'Documents' },
  notes: { label: 'Notes' },
  messaging: { label: 'Messages' },
}

/** Every trigger wired so far links to the parent matter; category-based fallbacks
 * cover future event types (e.g. a bare hearing/task reminder) that don't yet exist. */
export function resolveNotificationHref(n: Pick<NotificationRow, 'entity_type' | 'entity_id' | 'category'>): string {
  if (n.entity_type === 'matter' && n.entity_id) return `/matters/${n.entity_id}`
  // Trial/subscription reminders (notify_org_members, migration 0055) — send
  // to Firm Settings' Plan & Billing tab, not the time/expense billing page.
  if (n.entity_type === 'subscription') return '/administration'
  // Direct-message notifications (notify_dm_message, migration 0061) — deep
  // link straight into that conversation.
  if (n.entity_type === 'conversation' && n.entity_id) return `/messages?dm=${n.entity_id}`
  switch (n.category) {
    case 'clients': return '/clients'
    case 'hearings': return '/hearings'
    case 'tasks': return '/tasks'
    case 'documents': return '/documents'
    case 'billing': return '/billing'
    case 'notes': return '/matters'
    case 'messaging': return '/messages'
    default: return '/notifications'
  }
}
