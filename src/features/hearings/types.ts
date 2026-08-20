import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Hearing, HearingStatus, HearingType, Matter } from '@/shared/types/database.types'

export interface HearingRow extends Hearing {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number' | 'status'> | null
}

export const HEARING_TYPES: HearingType[] = ['mention', 'hearing', 'trial', 'ruling', 'motion', 'conference', 'other']

export const HEARING_STATUS_META: Record<HearingStatus, { label: string; variant: BadgeProps['variant'] }> = {
  scheduled: { label: 'Scheduled', variant: 'default' },
  adjourned: { label: 'Adjourned', variant: 'warning' },
  held: { label: 'Held', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
}

export const HEARING_STATUSES: HearingStatus[] = ['scheduled', 'adjourned', 'held', 'cancelled']
