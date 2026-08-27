import { supabase } from '@/shared/lib/supabase'
import type { HearingStatus } from '@/shared/types/database.types'
import type { HearingFormValues } from '@/features/hearings/schemas'
import type { HearingRow, HearingSupportingLawyerRow } from '@/features/hearings/types'

const SELECT =
  '*, matter:matters(id, title, matter_number, status), assigned_lawyer:profiles!hearings_assigned_lawyer_id_fkey(id, full_name, avatar_url), supporting_lawyers:hearing_supporting_lawyers(user:profiles!hearing_supporting_lawyers_user_id_fkey(id, full_name, avatar_url))'

export interface HearingFilters {
  search?: string
  status?: HearingStatus | 'all'
  from?: string
  to?: string
  matterId?: string | 'all'
  branchId?: string
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
    // Only meaningful for standalone (matterId-less) hearings — see the
    // identical note in tasks.service.ts's toRow().
    branch_id: values.matterId ? null : values.branchId || null,
    assigned_lawyer_id: values.assignedLawyerId || null,
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
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
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

  /** Quick status change, no full edit form — a minimal patch (not update()'s
   * full toRow() overwrite) so nothing else on the hearing gets touched.
   * The existing DB triggers (track_hearing_modified etc.) fire the same
   * way regardless of which columns changed, so notifications/timeline
   * entries still happen exactly as they would from the full edit form. */
  async setStatus(id: string, organizationId: string, status: HearingStatus, title: string): Promise<void> {
    const { error } = await supabase.from('hearings').update({ status }).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'hearing.updated',
      p_entity_type: 'hearing',
      p_entity_id: id,
      p_summary: `Marked "${title}" as ${status}`,
    })
  },

  /** Adjourn = reschedule, not just a status label. Sets status to
   * 'adjourned' AND the new date together, in one action — no more
   * "mark adjourned, then remember to separately go edit the date"
   * two-step flow. Reminder flags reset automatically (0129 trigger)
   * since hearing_at changes. Reason is prepended to notes rather than a
   * dedicated column — kept simple, still visible on the hearing card. */
  async adjourn(id: string, organizationId: string, title: string, newHearingAt: string, reason: string): Promise<void> {
    const { data: current, error: fetchErr } = await supabase.from('hearings').select('notes').eq('id', id).single()
    if (fetchErr) throw fetchErr
    const note = reason.trim()
      ? `Adjourned to ${new Date(newHearingAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}: ${reason.trim()}`
      : null
    const notes = [note, current?.notes].filter(Boolean).join('\n\n') || null
    const { error } = await supabase
      .from('hearings')
      .update({ status: 'adjourned', hearing_at: new Date(newHearingAt).toISOString(), notes })
      .eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'hearing.updated',
      p_entity_type: 'hearing',
      p_entity_id: id,
      p_summary: `Adjourned "${title}"${reason.trim() ? ` — ${reason.trim()}` : ''}`,
    })
  },

  // Supporting lawyers — plural, mirrors matters.service.ts's
  // listAssignments/assignMember/unassignMember exactly (0140).
  async listSupportingLawyers(hearingId: string): Promise<HearingSupportingLawyerRow[]> {
    const { data, error } = await supabase
      .from('hearing_supporting_lawyers')
      .select('*, user:profiles!hearing_supporting_lawyers_user_id_fkey(id, full_name, avatar_url)')
      .eq('hearing_id', hearingId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as HearingSupportingLawyerRow[]
  },

  async addSupportingLawyer(organizationId: string, hearingId: string, userId: string, assignedBy: string | null): Promise<void> {
    const { error } = await supabase
      .from('hearing_supporting_lawyers')
      .insert({ organization_id: organizationId, hearing_id: hearingId, user_id: userId, assigned_by: assignedBy })
    if (error) throw error
  },

  async removeSupportingLawyer(hearingId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('hearing_supporting_lawyers').delete().eq('hearing_id', hearingId).eq('user_id', userId)
    if (error) throw error
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
