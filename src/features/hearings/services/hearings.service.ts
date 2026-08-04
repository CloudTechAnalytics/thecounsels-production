import { supabase } from '@/shared/lib/supabase'
import type { HearingStatus } from '@/shared/types/database.types'
import type { HearingFormValues } from '@/features/hearings/schemas'
import type { HearingRow } from '@/features/hearings/types'

const SELECT = '*, matter:matters(id, title, matter_number)'

export interface HearingFilters {
  search?: string
  status?: HearingStatus | 'all'
  from?: string
  to?: string
  matterId?: string | 'all'
}

function toRow(values: HearingFormValues) {
  return {
    matter_id: values.matterId || null,
    title: values.title.trim(),
    hearing_at: new Date(values.hearingAt).toISOString(),
    type: values.type,
    status: values.status,
    court: values.court?.trim() || null,
    judge: values.judge?.trim() || null,
    location: values.location?.trim() || null,
    notes: values.notes?.trim() || null,
    outcome: values.outcome?.trim() || null,
  }
}

export const hearingsService = {
  async list(organizationId: string, filters: HearingFilters = {}): Promise<HearingRow[]> {
    let q = supabase
      .from('hearings')
      .select(SELECT)
      .eq('organization_id', organizationId)
      .order('hearing_at', { ascending: true })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.matterId && filters.matterId !== 'all') q = q.eq('matter_id', filters.matterId)
    if (filters.from) q = q.gte('hearing_at', filters.from)
    if (filters.to) q = q.lte('hearing_at', filters.to)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      q = q.or(`title.ilike.${s},court.ilike.${s},judge.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as HearingRow[]
  },

  async create(organizationId: string, values: HearingFormValues, createdBy: string | null): Promise<void> {
    const { data, error } = await supabase
      .from('hearings')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select('id')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'hearing.scheduled',
      p_entity_type: 'hearing',
      p_entity_id: data.id,
      p_summary: `Scheduled ${values.title}`,
    })
  },

  async update(id: string, organizationId: string, values: HearingFormValues): Promise<void> {
    const { error } = await supabase.from('hearings').update(toRow(values)).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'hearing.updated',
      p_entity_type: 'hearing',
      p_entity_id: id,
      p_summary: `Updated ${values.title}`,
    })
  },

  async remove(id: string, organizationId: string, title: string): Promise<void> {
    const { error } = await supabase.from('hearings').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'hearing.deleted',
      p_entity_type: 'hearing',
      p_entity_id: id,
      p_summary: `Deleted ${title}`,
    })
  },
}
