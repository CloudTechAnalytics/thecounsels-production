import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Client, Matter, MatterAssignment, MatterEvent, MatterNote, MatterStatus, Profile } from '@/shared/types/database.types'

export interface MatterRow extends Matter {
  client: Pick<Client, 'id' | 'display_name' | 'type'> | null
  lead_lawyer: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export interface MatterAssignmentRow extends MatterAssignment {
  user: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export interface MatterEventRow extends MatterEvent {
  actor: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

/** Linear lifecycle used by the status tracker (won/lost are terminal states). */
export const MATTER_LIFECYCLE: MatterStatus[] = ['open', 'in_court', 'appeal', 'closed']

export interface MatterNoteRow extends MatterNote {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  edited_by_profile: Pick<Profile, 'id' | 'full_name'> | null
}

export interface MatterSummary {
  documents: number
  notes: number
  hearings: number
  upcomingHearings: number
  tasks: number
  openTasks: number
  invoicesCount: number
  invoicesTotal: number
  invoicesOutstanding: number
  professionalFees: number
  expensesTotal: number
  amountPaid: number
  lastInvoiceDate: string | null
  lastPaymentDate: string | null
  unbilledTime: number
  unbilledExpenses: number
  totalUnbilledWork: number
}

export const PRACTICE_AREAS = [
  'Corporate & Commercial',
  'Litigation',
  'Real Estate',
  'Family Law',
  'Criminal Defense',
  'Intellectual Property',
  'Employment & Labour',
  'Tax',
  'Immigration',
  'Banking & Finance',
  'Dispute Resolution',
  'Other',
] as const

export const MATTER_STATUS_META: Record<MatterStatus, { label: string; variant: BadgeProps['variant'] }> = {
  open: { label: 'New', variant: 'success' },
  // Legacy alias — "Pending" and "In Court" were the same idea wearing two
  // labels; existing matters keep the stored value, but display and behave
  // identically to In Court everywhere from here on.
  pending: { label: 'In Court', variant: 'default' },
  in_court: { label: 'In Court', variant: 'default' },
  appeal: { label: 'Appeal', variant: 'warning' },
  closed: { label: 'Closed', variant: 'muted' },
  // Won/Lost are retired from new selection (folded into Closed) but kept
  // here so any existing matter still tagged with one displays correctly.
  won: { label: 'Won', variant: 'success' },
  lost: { label: 'Lost', variant: 'destructive' },
}

/** Selectable when opening/editing a matter. Pending/Won/Lost stay valid,
 * displayable statuses for existing data (see MATTER_STATUS_META above)
 * but are no longer offered as a fresh choice — Pending merged into In
 * Court, and Won/Lost fold into Closed. */
export const MATTER_STATUSES: MatterStatus[] = ['open', 'in_court', 'appeal', 'closed']

/** Filtering by "In Court" or "Closed" also matches the legacy values that
 * merged into them, so a matter stored as 'pending'/'won'/'lost' before
 * this change is still findable under its new, consolidated label. */
export const MATTER_STATUS_FILTER_GROUPS: Partial<Record<MatterStatus, MatterStatus[]>> = {
  in_court: ['in_court', 'pending'],
  closed: ['closed', 'won', 'lost'],
}

export const PRIORITIES = ['low', 'medium', 'high'] as const
