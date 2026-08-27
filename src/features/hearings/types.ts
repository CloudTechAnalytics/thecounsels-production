import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Hearing, HearingStatus, HearingType, Matter, Profile } from '@/shared/types/database.types'

export interface HearingRow extends Hearing {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number' | 'status'> | null
  assigned_lawyer: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
  supporting_lawyers: { user: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null }[]
}

/** hearing_supporting_lawyers (0140) — plural, many-to-many, mirrors
 * MatterAssignmentRow's own shape. */
export interface HearingSupportingLawyerRow {
  id: string
  hearing_id: string
  user_id: string
  user: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export const HEARING_TYPES: HearingType[] = ['mention', 'hearing', 'trial', 'ruling', 'motion', 'conference', 'other']

export const HEARING_STATUS_META: Record<HearingStatus, { label: string; variant: BadgeProps['variant'] }> = {
  scheduled: { label: 'Scheduled', variant: 'default' },
  adjourned: { label: 'Adjourned', variant: 'warning' },
  held: { label: 'Held', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
}

export const HEARING_STATUSES: HearingStatus[] = ['scheduled', 'adjourned', 'held', 'cancelled']
