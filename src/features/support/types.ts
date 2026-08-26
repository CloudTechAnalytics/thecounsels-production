import type { BadgeProps } from '@/shared/components/ui/badge'
import type { SupportSessionStatus, TicketPriority, TicketStatus } from '@/shared/types/database.types'

/** A support-access request/session (0133) — request_support_session()
 * creates it 'pending'; the firm's own admin grants or denies it. */
export interface SupportSessionRow {
  id: string
  organization_id: string
  admin_id: string | null
  reason: string | null
  status: SupportSessionStatus
  granted_by: string | null
  granted_at: string | null
  denied_at: string | null
  started_at: string
  expires_at: string
  ended_at: string | null
  created_at: string
  admin: { id: string; full_name: string | null; email: string } | null
}

export interface TicketPerson {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
}

export interface TicketRow {
  id: string
  organization_id: string
  ticket_number: string | null
  subject: string
  status: TicketStatus
  priority: TicketPriority
  created_by: string | null
  assignee_id: string | null
  support_session_id: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  organization: { id: string; name: string; slug: string; logo_url: string | null } | null
  creator: TicketPerson | null
  assignee: TicketPerson | null
}

export interface TicketMessage {
  id: string
  ticket_id: string
  author_id: string | null
  from_platform: boolean
  body: string
  created_at: string
  author: TicketPerson | null
}

export interface TicketDetail extends TicketRow {
  messages: TicketMessage[]
}

export const TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
export const TICKET_PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent']

export const TICKET_STATUS_META: Record<TicketStatus, { label: string; variant: BadgeProps['variant'] }> = {
  open: { label: 'Open', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'warning' },
  waiting: { label: 'Waiting on customer', variant: 'muted' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'muted' },
}

export const TICKET_PRIORITY_META: Record<TicketPriority, { label: string; variant: BadgeProps['variant'] }> = {
  low: { label: 'Low', variant: 'muted' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'warning' },
  urgent: { label: 'Urgent', variant: 'destructive' },
}

/** Statuses that count as "needs attention" for KPI purposes. */
export const OPEN_TICKET_STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting']
