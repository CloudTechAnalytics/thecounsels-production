import { supabase } from '@/shared/lib/supabase'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'

export interface AssistantMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface AssistantConversationRow {
  id: string
  title: string
  updated_at: string
}

/** General schedule/workload AI assistant — cross-cutting (topbar entry
 * point, not scoped to any one matter). Business/Enterprise (or whichever
 * plans have ai_summarization toggled on) only; the real enforcement lives
 * server-side in the ask-assistant Edge Function. Conversations (0166) —
 * each a real row, not just an in-memory grouping — let a user keep
 * several distinct threads side by side, ChatGPT-style. */
export const assistantService = {
  /** Most-recently-active first — same ordering ChatGPT's own sidebar uses. */
  async listConversations(organizationId: string): Promise<AssistantConversationRow[]> {
    const { data, error } = await supabase
      .from('assistant_conversations')
      .select('id, title, updated_at')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async listMessages(conversationId: string): Promise<AssistantMessageRow[]> {
    const { data, error } = await supabase
      .from('assistant_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as AssistantMessageRow[]
  },

  /** No client-direct insert — ask-assistant (service-role) writes both the
   * user's message and the assistant's reply in one call. Pass
   * conversationId null to start a brand-new conversation — the function
   * creates it (titled from this first message) and returns its id. */
  sendMessage(organizationId: string, conversationId: string | null, message: string): Promise<{ reply: string; conversationId: string }> {
    return invokeEdgeFunction('ask-assistant', { organizationId, conversationId, message })
  },

  /** Self-service — deleting a conversation cascades to its messages via
   * the FK (0166), same "user managing their own chat history" reasoning
   * 0127 already established. .select('id') so a filter/RLS mismatch that
   * silently deletes nothing surfaces as a real error, not a false success
   * (same defensive check the old bulk clearMessages() used). */
  async deleteConversation(conversationId: string): Promise<void> {
    const { data, error } = await supabase.from('assistant_conversations').delete().eq('id', conversationId).select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Nothing was actually deleted. Please refresh the page and try again.')
    }
  },
}
