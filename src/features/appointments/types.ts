import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Appointment, AppointmentStatus, Client, Matter, Profile } from '@/shared/types/database.types'

export interface AppointmentRow extends Appointment {
  client: Pick<Client, 'id' | 'display_name'> | null
  matter: Pick<Matter, 'id' | 'title' | 'matter_number' | 'status'> | null
  assigned_to: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export const APPOINTMENT_STATUS_META: Record<AppointmentStatus, { label: string; variant: BadgeProps['variant'] }> = {
  scheduled: { label: 'Scheduled', variant: 'default' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  no_show: { label: 'No-show', variant: 'destructive' },
}

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show']
