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
  /** Clears this user's own assistant history for this org (0127 — DELETE
   * is self-service, unlike INSERT above). Filtered to organization_id
   * explicitly: the RLS policy only scopes by user_id, not org, so an
   * unfiltered delete here would wipe this user's history across every
   * firm they belong to.
   *
   * .select('id') on the delete so we know how many rows actually went —
   * a delete whose filter/RLS matches zero rows is NOT a Postgrest error,
   * it's a normal 200 with an empty result, so without this check a real
   * failure to delete anything looks identical to success: the UI clears
   * its local cache, but nothing changed server-side, and the history
   * reappears the next time this list refetches. Surfacing that as a real
   * error here — instead of a silent no-op "success" — is what actually
   * lets this get diagnosed if it happens again. */
  async clearMessages(organizationId: string): Promise<void> {
    const { data, error } = await supabase.from('assistant_messages').delete().eq('organization_id', organizationId).select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Nothing was actually cleared. Please refresh the page and try again.')
    }
  },
}
