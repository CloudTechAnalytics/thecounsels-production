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
export const MATTER_LIFECYCLE: MatterStatus[] = ['open', 'pending', 'in_court', 'closed']

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
  open: { label: 'Open', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  in_court: { label: 'In Court', variant: 'default' },
  closed: { label: 'Closed', variant: 'muted' },
  won: { label: 'Won', variant: 'success' },
  lost: { label: 'Lost', variant: 'destructive' },
}

export const PRIORITIES = ['low', 'medium', 'high'] as const
