import { supabase } from '@/shared/lib/supabase'
import type { AppointmentStatus } from '@/shared/types/database.types'
import type { AppointmentFormValues } from '@/features/appointments/schemas'
import type { AppointmentRow } from '@/features/appointments/types'

const SELECT =
  '*, client:clients(id, display_name), matter:matters(id, title, matter_number, status), assigned_to:profiles!appointments_assigned_to_id_fkey(id, full_name, avatar_url)'

export interface AppointmentFilters {
  search?: string
  status?: AppointmentStatus | 'all'
  from?: string
  to?: string
  matterId?: string | 'all'
  clientId?: string | 'all'
  assignedToId?: string | 'all'
  branchId?: string
}

function toRow(values: AppointmentFormValues) {
  return {
    client_id: values.clientId || null,
    matter_id: values.matterId || null,
    title: values.title.trim(),
    appointment_at: new Date(values.appointmentAt).toISOString(),
    duration_minutes: values.durationMinutes ?? null,
    location: values.location?.trim() || null,
    assigned_to_id: values.assignedToId || null,
    status: values.status,
    notes: values.notes?.trim() || null,
  }
}

export const appointmentsService = {
  async list(organizationId: string, filters: AppointmentFilters = {}): Promise<AppointmentRow[]> {
    let q = supabase
      .from('appointments')
      .select(SELECT)
      .eq('organization_id', organizationId)
      .order('appointment_at', { ascending: true })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.matterId && filters.matterId !== 'all') q = q.eq('matter_id', filters.matterId)
    if (filters.clientId && filters.clientId !== 'all') q = q.eq('client_id', filters.clientId)
    if (filters.assignedToId && filters.assignedToId !== 'all') q = q.eq('assigned_to_id', filters.assignedToId)
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
    if (filters.from) q = q.gte('appointment_at', filters.from)
    if (filters.to) q = q.lte('appointment_at', filters.to)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      q = q.or(`title.ilike.${s},location.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as AppointmentRow[]
  },

  async create(organizationId: string, values: AppointmentFormValues, createdBy: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('appointments')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select('id')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'appointment.scheduled',
      p_entity_type: 'appointment',
      p_entity_id: data.id,
      p_summary: `Scheduled ${values.title}`,
    })
  },

  async update(id: string, organizationId: string, values: AppointmentFormValues): Promise<void> {
    const { error } = await supabase.from('appointments').update(toRow(values)).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'appointment.updated',
      p_entity_type: 'appointment',
      p_entity_id: id,
      p_summary: `Updated ${values.title}`,
    })
  },

  /** Quick status change, no full edit form — a minimal patch, same pattern
   * as hearingsService.setStatus()/mattersService.setStatus(). */
  async setStatus(id: string, organizationId: string, status: AppointmentStatus, title: string): Promise<void> {
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'appointment.updated',
      p_entity_type: 'appointment',
      p_entity_id: id,
      p_summary: `Marked "${title}" as ${status}`,
    })
  },

  async remove(id: string, organizationId: string, title: string): Promise<void> {
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'appointment.deleted',
      p_entity_type: 'appointment',
      p_entity_id: id,
      p_summary: `Deleted ${title}`,
    })
  },
}
