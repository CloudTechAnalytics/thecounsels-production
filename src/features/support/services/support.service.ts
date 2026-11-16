import { supabase } from '@/shared/lib/supabase'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'
import type { TicketPriority, TicketStatus } from '@/shared/types/database.types'
import type { SupportSessionRow, TicketDetail, TicketMessage, TicketRow } from '@/features/support/types'

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

/** What send-ticket-email reports back. */
export interface EmailResult { ok: boolean; sent?: string[]; failed?: { to: string; error: string }[]; skipped?: boolean; error?: string }

/** A firm member the platform can message. */
export interface FirmRecipient {
  user_id: string
  full_name: string | null
  email: string
  role: string | null
  is_owner: boolean
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

  /** Adds a message; for a conversation The Counsel started (0210) it is
   * also emailed — to the firm's recipients when we write, to us when they do. */
  async addMessage(ticketId: string, body: string): Promise<EmailResult | null> {
    const { data, error } = await supabase
      .from('support_ticket_messages').insert({ ticket_id: ticketId, body: body.trim() }).select('id').single()
    if (error) throw error
    return supportService.emailMessage(data.id).catch(() => null)
  },

  async emailMessage(messageId: string): Promise<EmailResult> {
    return invokeEdgeFunction<EmailResult>('send-ticket-email', { messageId })
  },

  /** Platform: everyone active in a firm, for the recipient picker. */
  async listFirmRecipients(organizationId: string): Promise<FirmRecipient[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select('user_id, is_owner, role:roles(name), profile:profiles!memberships_user_id_fkey(full_name, email)')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
    if (error) throw error
    type R = { user_id: string; is_owner: boolean; role: { name: string } | null; profile: { full_name: string | null; email: string } | null }
    return ((data ?? []) as unknown as R[])
      .filter((r) => r.profile?.email)
      .map((r) => ({ user_id: r.user_id, is_owner: r.is_owner, role: r.role?.name ?? null, full_name: r.profile!.full_name, email: r.profile!.email }))
      .sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email))
  },

  /** Platform: start a conversation with a firm and email it to the chosen people. */
  async messageFirm(input: { organizationId: string; subject: string; body: string; recipients: string[]; extraEmails: string[] }): Promise<{ id: string; email: EmailResult | null }> {
    const { data: id, error } = await supabase.rpc('platform_message_firm', {
      p_org: input.organizationId, p_subject: input.subject, p_body: input.body,
      p_recipients: input.recipients, p_extra_emails: input.extraEmails,
    })
    if (error) throw error
    const { data: first } = await supabase.from('support_ticket_messages').select('id').eq('ticket_id', id as string).order('created_at').limit(1).single()
    const email = first ? await supportService.emailMessage(first.id).catch((e) => ({ ok: false, error: e instanceof Error ? e.message : 'Email failed' })) : null
    return { id: id as string, email }
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

  /** Firm side — pending support-access requests waiting on this org's own
   * admin to grant or deny (0133). RLS already scopes support_sessions to
   * is_platform_admin() or is_org_admin(organization_id), so a non-admin
   * firm member simply gets none back rather than an error. */
  async listPendingSessions(organizationId: string): Promise<SupportSessionRow[]> {
    const { data, error } = await supabase
      .from('support_sessions')
      .select('*, admin:profiles!support_sessions_admin_id_fkey(id, full_name, email)')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as SupportSessionRow[]
  },

  async grantSupportSession(id: string): Promise<SupportSessionRow> {
    const { data, error } = await supabase.rpc('grant_support_session', { p_id: id })
    if (error) throw error
    return data as unknown as SupportSessionRow
  },

  async denySupportSession(id: string): Promise<void> {
    const { error } = await supabase.rpc('deny_support_session', { p_id: id })
    if (error) throw error
  },
}
