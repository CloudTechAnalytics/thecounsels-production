import { supabase } from '@/shared/lib/supabase'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'

export interface AssistantMessageRow {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

/** General schedule/workload AI assistant — cross-cutting (topbar entry
 * point, not scoped to any one matter). Business/Enterprise only; the real
 * enforcement lives server-side in the ask-assistant Edge Function. */
export const assistantService = {
  /** Per-(org, user) — RLS on assistant_messages scopes to user_id =
   * auth.uid() only, so the org filter here keeps a user's history from
   * mixing across firms if they belong to more than one. */
  async listMessages(organizationId: string): Promise<AssistantMessageRow[]> {
    const { data, error } = await supabase
      .from('assistant_messages')
      .select('id, role, content, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as AssistantMessageRow[]
  },
  /** No client-direct insert — ask-assistant (service-role) writes both the
   * user's message and the assistant's reply in one call. */
  sendMessage(organizationId: string, message: string): Promise<{ reply: string }> {
    return invokeEdgeFunction('ask-assistant', { organizationId, message })
  },
}
