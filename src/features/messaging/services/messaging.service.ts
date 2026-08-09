import { supabase } from '@/shared/lib/supabase'
import type { Channel, DirectConversation } from '@/shared/types/database.types'
import type { ChannelFormValues } from '@/features/messaging/schemas'
import type { ChannelMessageRow, ChannelRow, ConversationRow, DirectMessageRow } from '@/features/messaging/types'

const MESSAGE_PAGE_SIZE = 50

const CHANNEL_MESSAGE_SELECT = '*, author:profiles!channel_messages_author_id_fkey(id, full_name, avatar_url)'
const DIRECT_MESSAGE_SELECT = '*, author:profiles!direct_messages_author_id_fkey(id, full_name, avatar_url)'
// Two FKs from direct_conversations to profiles (user_a, user_b) — must disambiguate by constraint name.
const CONVERSATION_SELECT =
  '*, a:profiles!direct_conversations_user_a_fkey(id, full_name, avatar_url, last_seen_at), b:profiles!direct_conversations_user_b_fkey(id, full_name, avatar_url, last_seen_at)'

export const messagingService = {
  async listChannels(organizationId: string, userId: string, includeArchived = false): Promise<ChannelRow[]> {
    let q = supabase
      .from('channels')
      .select('*')
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    q = includeArchived ? q.not('archived_at', 'is', null) : q.is('archived_at', null)

    const [{ data: channels, error: chErr }, { data: reads, error: readErr }] = await Promise.all([
      q,
      supabase.from('channel_reads').select('channel_id, last_read_at').eq('user_id', userId),
    ])
    if (chErr) throw chErr
    if (readErr) throw readErr
    const readMap = new Map((reads ?? []).map((r) => [r.channel_id, r.last_read_at]))
    return (channels ?? []).map((c) => ({
      ...c,
      unread: Boolean(c.last_message_at) && (() => {
        const lastRead = readMap.get(c.id)
        return !lastRead || new Date(c.last_message_at!) > new Date(lastRead)
      })(),
    }))
  },

  async createChannel(organizationId: string, values: ChannelFormValues, createdBy: string): Promise<Channel> {
    const { data, error } = await supabase
      .from('channels')
      .insert({
        organization_id: organizationId,
        name: values.name.trim(),
        description: values.description?.trim() || null,
        created_by: createdBy,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async archiveChannel(id: string): Promise<void> {
    const { error } = await supabase.from('channels').update({ archived_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async unarchiveChannel(id: string): Promise<void> {
    const { error } = await supabase.from('channels').update({ archived_at: null }).eq('id', id)
    if (error) throw error
  },

  /** Permanently removes the channel and every message in it — routed
   * through the delete_channel RPC so it's always recorded in audit_logs
   * (see migration 0064); there's no direct delete policy on `channels`. */
  async deleteChannel(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_channel', { p_channel: id })
    if (error) throw error
  },

  async listChannelMessages(channelId: string, before?: string): Promise<ChannelMessageRow[]> {
    let q = supabase
      .from('channel_messages')
      .select(CHANNEL_MESSAGE_SELECT)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE)
    if (before) q = q.lt('created_at', before)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as unknown as ChannelMessageRow[]).reverse() // oldest-first for display
  },

  async sendChannelMessage(organizationId: string, channelId: string, authorId: string, body: string): Promise<void> {
    const { error } = await supabase
      .from('channel_messages')
      .insert({ organization_id: organizationId, channel_id: channelId, author_id: authorId, body: body.trim() })
    if (error) throw error
  },

  async deleteChannelMessage(id: string): Promise<void> {
    const { error } = await supabase.from('channel_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async markChannelRead(channelId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_channel_read', { p_channel: channelId })
    if (error) throw error
  },

  async listConversations(organizationId: string, userId: string): Promise<ConversationRow[]> {
    const { data, error } = await supabase
      .from('direct_conversations')
      .select(CONVERSATION_SELECT)
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as Array<DirectConversation & { a: ConversationRow['other']; b: ConversationRow['other'] }>).map(
      (row) => {
        const iAmA = row.user_a === userId
        const lastRead = iAmA ? row.user_a_last_read_at : row.user_b_last_read_at
        return {
          ...row,
          other: iAmA ? row.b : row.a,
          unread: Boolean(row.last_message_at) && (!lastRead || new Date(row.last_message_at!) > new Date(lastRead)),
        }
      },
    )
  },

  async getOrCreateConversation(organizationId: string, otherUserId: string): Promise<DirectConversation> {
    const { data, error } = await supabase.rpc('get_or_create_dm_conversation', { p_org: organizationId, p_other: otherUserId })
    if (error) throw error
    return data as DirectConversation
  },

  async listDirectMessages(conversationId: string, before?: string): Promise<DirectMessageRow[]> {
    let q = supabase
      .from('direct_messages')
      .select(DIRECT_MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_PAGE_SIZE)
    if (before) q = q.lt('created_at', before)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as unknown as DirectMessageRow[]).reverse()
  },

  async sendDirectMessage(organizationId: string, conversationId: string, authorId: string, body: string): Promise<void> {
    const { error } = await supabase
      .from('direct_messages')
      .insert({ organization_id: organizationId, conversation_id: conversationId, author_id: authorId, body: body.trim() })
    if (error) throw error
  },

  async deleteDirectMessage(id: string): Promise<void> {
    const { error } = await supabase.from('direct_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async markDmRead(conversationId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_dm_read', { p_conversation: conversationId })
    if (error) throw error
  },

  async getUnreadCount(organizationId: string): Promise<number> {
    const { data, error } = await supabase.rpc('get_unread_message_count', { p_org: organizationId })
    if (error) throw error
    return data ?? 0
  },
}
