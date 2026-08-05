import { supabase } from '@/shared/lib/supabase'
import type { MatterStatus } from '@/shared/types/database.types'
import type { MatterFormValues } from '@/features/matters/schemas'
import type { MatterAssignmentRow, MatterEventRow, MatterNoteRow, MatterRow, MatterSummary } from '@/features/matters/types'

const MATTER_SELECT =
  '*, client:clients(id, display_name, type), lead_lawyer:profiles!matters_lead_lawyer_id_fkey(id, full_name, avatar_url)'

export interface MatterFilters {
  search?: string
  status?: MatterStatus | 'all'
  practiceArea?: string | 'all'
}

function toRow(values: MatterFormValues) {
  return {
    title: values.title.trim(),
    client_id: values.clientId || null,
    practice_area: values.practiceArea || null,
    status: values.status,
    priority: values.priority,
    lead_lawyer_id: values.leadLawyerId || null,
    opposing_counsel: values.opposingCounsel?.trim() || null,
    court: values.court?.trim() || null,
    judge: values.judge?.trim() || null,
    description: values.description?.trim() || null,
  }
}

export const mattersService = {
  async list(organizationId: string, filters: MatterFilters = {}): Promise<MatterRow[]> {
    let q = supabase
      .from('matters')
      .select(MATTER_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.practiceArea && filters.practiceArea !== 'all') q = q.eq('practice_area', filters.practiceArea)
    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      q = q.or(`title.ilike.${s},matter_number.ilike.${s}`)
    }
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as MatterRow[]
  },

  async get(id: string): Promise<MatterRow> {
    const { data, error } = await supabase.from('matters').select(MATTER_SELECT).eq('id', id).single()
    if (error) throw error
    return data as unknown as MatterRow
  },

  async create(organizationId: string, values: MatterFormValues, createdBy: string | null): Promise<MatterRow> {
    const { data, error } = await supabase
      .from('matters')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
      .select(MATTER_SELECT)
      .single()
    if (error) throw error
    const row = data as unknown as MatterRow
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'matter.created',
      p_entity_type: 'matter',
      p_entity_id: row.id,
      p_summary: `Opened matter ${row.matter_number ?? ''} — ${row.title}`,
    })
    return row
  },

  async update(id: string, organizationId: string, values: MatterFormValues): Promise<MatterRow> {
    const patch = {
      ...toRow(values),
      closed_on: ['closed', 'won', 'lost'].includes(values.status) ? new Date().toISOString().slice(0, 10) : null,
    }
    const { data, error } = await supabase.from('matters').update(patch).eq('id', id).select(MATTER_SELECT).single()
    if (error) throw error
    const row = data as unknown as MatterRow
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'matter.updated',
      p_entity_type: 'matter',
      p_entity_id: id,
      p_summary: `Updated matter ${row.matter_number ?? ''}`,
    })
    return row
  },

  async remove(id: string, organizationId: string, label: string): Promise<void> {
    const { error } = await supabase.from('matters').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'matter.deleted',
      p_entity_type: 'matter',
      p_entity_id: id,
      p_summary: `Deleted matter ${label}`,
    })
  },

  // Notes ---------------------------------------------------------------------
  async listNotes(matterId: string): Promise<MatterNoteRow[]> {
    const { data, error } = await supabase
      .from('matter_notes')
      .select(
        '*, author:profiles!matter_notes_author_id_fkey(id, full_name, avatar_url), edited_by_profile:profiles!matter_notes_edited_by_fkey(id, full_name)',
      )
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as MatterNoteRow[]
  },

  async addNote(organizationId: string, matterId: string, body: string, authorId: string | null): Promise<void> {
    const { error } = await supabase
      .from('matter_notes')
      .insert({ organization_id: organizationId, matter_id: matterId, author_id: authorId, body })
    if (error) throw error
  },

  async updateNote(id: string, body: string, editedBy: string | null): Promise<void> {
    const { error } = await supabase.from('matter_notes').update({ body, edited_by: editedBy }).eq('id', id)
    if (error) throw error
  },

  async deleteNote(id: string): Promise<void> {
    const { error } = await supabase.from('matter_notes').delete().eq('id', id)
    if (error) throw error
  },

  // Tracking timeline ---------------------------------------------------------
  async listEvents(matterId: string): Promise<MatterEventRow[]> {
    const { data, error } = await supabase
      .from('matter_events')
      .select('*, actor:profiles(id, full_name, avatar_url)')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as MatterEventRow[]
  },

  async addEvent(organizationId: string, matterId: string, summary: string, actorId: string | null): Promise<void> {
    const { error } = await supabase
      .from('matter_events')
      .insert({ organization_id: organizationId, matter_id: matterId, actor_id: actorId, kind: 'update', summary })
    if (error) throw error
  },

  // Team assignments ------------------------------------------------------
  async listAssignments(matterId: string): Promise<MatterAssignmentRow[]> {
    const { data, error } = await supabase
      .from('matter_assignments')
      .select('*, user:profiles(id, full_name, avatar_url)')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as MatterAssignmentRow[]
  },

  async assignMember(organizationId: string, matterId: string, userId: string, assignedBy: string | null): Promise<void> {
    const { error } = await supabase
      .from('matter_assignments')
      .insert({ organization_id: organizationId, matter_id: matterId, user_id: userId, assigned_by: assignedBy })
    if (error) throw error
  },

  async unassignMember(matterId: string, userId: string): Promise<void> {
    const { error } = await supabase.from('matter_assignments').delete().eq('matter_id', matterId).eq('user_id', userId)
    if (error) throw error
  },

  // Summary widget --------------------------------------------------------
  async getSummary(matterId: string): Promise<MatterSummary> {
    const [docs, notes, hearings, tasks, invoices, time, expenses] = await Promise.all([
      supabase.from('documents').select('id', { count: 'exact', head: true }).eq('matter_id', matterId),
      supabase.from('matter_notes').select('id', { count: 'exact', head: true }).eq('matter_id', matterId),
      supabase.from('hearings').select('hearing_at, status').eq('matter_id', matterId),
      supabase.from('tasks').select('status').eq('matter_id', matterId),
      supabase.from('invoices').select('id, total, amount_paid, status, issue_date').eq('matter_id', matterId),
      supabase.from('time_entries').select('minutes, rate').eq('matter_id', matterId).eq('billable', true),
      supabase.from('expenses').select('amount').eq('matter_id', matterId).eq('billable', true),
    ])
    for (const r of [docs, notes, hearings, tasks, invoices, time, expenses]) if (r.error) throw r.error

    const hearingRows = hearings.data ?? []
    const taskRows = tasks.data ?? []
    const invoiceRows = (invoices.data ?? []).filter((i) => i.status !== 'void')
    const timeRows = time.data ?? []
    const expenseRows = expenses.data ?? []

    let lastPaymentDate: string | null = null
    const invoiceIds = invoiceRows.map((i) => i.id)
    if (invoiceIds.length > 0) {
      const { data: lastPayment, error: payErr } = await supabase
        .from('payments')
        .select('paid_at')
        .in('invoice_id', invoiceIds)
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (payErr) throw payErr
      lastPaymentDate = lastPayment?.paid_at ?? null
    }

    const invoiceDates = invoiceRows.map((i) => i.issue_date).sort()

    return {
      documents: docs.count ?? 0,
      notes: notes.count ?? 0,
      hearings: hearingRows.length,
      upcomingHearings: hearingRows.filter((h) => h.status === 'scheduled' && new Date(h.hearing_at) > new Date()).length,
      tasks: taskRows.length,
      openTasks: taskRows.filter((t) => t.status !== 'done').length,
      invoicesCount: invoiceRows.length,
      invoicesTotal: invoiceRows.reduce((s, i) => s + Number(i.total), 0),
      invoicesOutstanding: invoiceRows.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0),
      professionalFees: timeRows.reduce((s, t) => s + Math.round((t.minutes / 60) * Number(t.rate) * 100) / 100, 0),
      expensesTotal: expenseRows.reduce((s, e) => s + Number(e.amount), 0),
      amountPaid: invoiceRows.reduce((s, i) => s + Number(i.amount_paid), 0),
      lastInvoiceDate: invoiceDates.length > 0 ? invoiceDates[invoiceDates.length - 1] : null,
      lastPaymentDate,
    }
  },
}
