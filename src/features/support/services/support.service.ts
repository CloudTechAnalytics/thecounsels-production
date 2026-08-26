import { supabase } from '@/shared/lib/supabase'
import type { TicketPriority, TicketStatus } from '@/shared/types/database.types'
import type { TicketDetail, TicketMessage, TicketRow } from '@/features/support/types'

const TICKET_SELECT = `*,
  organization:organizations(id, name, slug, logo_url),
  creator:profiles!support_tickets_created_by_fkey(id, full_name, email, avatar_url),
  assignee:profiles!support_tickets_assignee_id_fkey(id, full_name, email, avatar_url)`

const MESSAGE_SELECT = '*, author:profiles!support_ticket_messages_author_id_fkey(id, full_name, email, avatar_url)'

export interface TicketFilters {
  organizationId?: string
  status?: TicketStatus | 'all'
  search?: string
}

export const supportService = {
  /** Platform: all tickets. Firm: pass organizationId to scope (RLS enforces anyway). */
  async listTickets(filters: TicketFilters = {}): Promise<TicketRow[]> {
    let query = supabase.from('support_tickets').select(TICKET_SELECT).order('updated_at', { ascending: false })
    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
    if (filters.search?.trim()) {
      const s = filters.search.trim()
      query = query.or(`subject.ilike.%${s}%,ticket_number.ilike.%${s}%`)
    }
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as unknown as TicketRow[]
  },

  async getTicket(id: string): Promise<TicketDetail> {
    const [{ data: ticket, error: e1 }, { data: messages, error: e2 }] = await Promise.all([
      supabase.from('support_tickets').select(TICKET_SELECT).eq('id', id).single(),
      supabase.from('support_ticket_messages').select(MESSAGE_SELECT).eq('ticket_id', id).order('created_at', { ascending: true }),
    ])
    if (e1) throw e1
    if (e2) throw e2
    return { ...(ticket as unknown as TicketRow), messages: (messages ?? []) as unknown as TicketMessage[] }
  },

  async createTicket(input: {
    organizationId: string
    subject: string
    body: string
    priority: TicketPriority
    createdBy: string | null
  }): Promise<string> {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        organization_id: input.organizationId,
        subject: input.subject.trim(),
        priority: input.priority,
        created_by: input.createdBy,
      })
      .select('id, ticket_number')
      .single()
    if (error) throw error
    const { error: msgError } = await supabase
      .from('support_ticket_messages')
      .insert({ ticket_id: data.id, body: input.body.trim() })
    if (msgError) throw msgError
    await supabase.rpc('log_audit', {
      p_org: input.organizationId,
      p_action: 'support.ticket_created',
      p_entity_type: 'support_ticket',
      p_entity_id: data.id,
      p_summary: `Support ticket ${data.ticket_number ?? ''} opened: ${input.subject.trim()}`,
    })
    return data.id
  },

  async updateTicket(
    id: string,
    organizationId: string,
    patch: { status?: TicketStatus; priority?: TicketPriority; assignee_id?: string | null },
  ): Promise<void> {
    const { error } = await supabase.from('support_tickets').update(patch).eq('id', id)
    if (error) throw error
    if (patch.status) {
      await supabase.rpc('log_audit', {
        p_org: organizationId,
        p_action: `support.ticket_${patch.status}`,
        p_entity_type: 'support_ticket',
        p_entity_id: id,
        p_summary: `Support ticket marked ${patch.status.replace('_', ' ')}`,
      })
    }
  },

  async addMessage(ticketId: string, body: string): Promise<void> {
    const { error } = await supabase.from('support_ticket_messages').insert({ ticket_id: ticketId, body: body.trim() })
    if (error) throw error
  },

  /** Either side can delete — platform staff or any member of the firm
   * that raised it (0131). Messages cascade via the FK, no separate call
   * needed. */
  async deleteTicket(id: string, organizationId: string, ticketNumber: string | null): Promise<void> {
    const { error } = await supabase.from('support_tickets').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'support.ticket_deleted',
      p_entity_type: 'support_ticket',
      p_entity_id: id,
      p_summary: `Support ticket ${ticketNumber ?? ''} deleted`,
    })
  },
}
