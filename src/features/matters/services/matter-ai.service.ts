import { supabase } from '@/shared/lib/supabase'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'

export interface MatterSummaryResult {
  summary: string
  generatedAt: string
}

export interface MatterAiChatMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** Business/Enterprise only — the real enforcement lives server-side in the
 * summarize-matter / chat-with-matter Edge Functions; see their own
 * comments for why. */
export const matterAiService = {
  summarizeMatter(matterId: string): Promise<MatterSummaryResult> {
    return invokeEdgeFunction('summarize-matter', { matterId })
  },
  /** Per-user — RLS on matter_ai_chat_messages already scopes to
   * user_id = auth.uid(), no explicit filter needed here. */
  async listChatMessages(matterId: string): Promise<MatterAiChatMessageRow[]> {
    const { data, error } = await supabase
      .from('matter_ai_chat_messages')
      .select('id, role, content, created_at')
      .eq('matter_id', matterId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as MatterAiChatMessageRow[]
  },
  /** No client-direct insert — chat-with-matter (service-role) writes both
   * the user's message and the AI's reply in one call; see its own comment. */
  sendChatMessage(matterId: string, message: string): Promise<{ reply: string }> {
    return invokeEdgeFunction('chat-with-matter', { matterId, message })
  },
}
