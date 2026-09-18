import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantService, type AssistantMessageRow } from '@/shared/services/assistant.service'

const conversationsKey = (organizationId: string | null) => ['assistant-conversations', organizationId]
const messagesKey = (conversationId: string | null) => ['assistant-messages', conversationId]

export function useAssistantConversations(organizationId: string | null) {
  return useQuery({
    queryKey: conversationsKey(organizationId),
    enabled: Boolean(organizationId),
    queryFn: () => assistantService.listConversations(organizationId!),
  })
}

export function useAssistantMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesKey(conversationId),
    enabled: Boolean(conversationId),
    queryFn: () => assistantService.listMessages(conversationId!),
  })
}

/** conversationId null means "start a new conversation" — the mutation
 * resolves with the real id (brand-new or the one passed in), so the
 * caller can switch the active conversation to it and the sidebar picks
 * up the new/bumped row via the conversations-list invalidation below. */
export function useSendAssistantMessage(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ conversationId, message }: { conversationId: string | null; message: string }) =>
      assistantService.sendMessage(organizationId!, conversationId, message),
    // Optimistic echo into whichever conversation this reply is headed for
    // — a genuinely new conversation has no cache entry yet to echo into,
    // so this only fires for a continuing one (use-matter-ai.ts's own
    // comment explains the same pattern: the real insert only happens
    // once the reply is ready server-side).
    onMutate: async ({ conversationId, message }) => {
      if (!conversationId) return undefined
      const key = messagesKey(conversationId)
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<AssistantMessageRow[]>(key)
      const optimistic: AssistantMessageRow = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<AssistantMessageRow[]>(key, (old) => [...(old ?? []), optimistic])
      return { previous, key }
    },
    onError: (_err, _vars, context) => {
      if (context) qc.setQueryData(context.key, context.previous)
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: messagesKey(result.conversationId) })
      qc.invalidateQueries({ queryKey: conversationsKey(organizationId) })
    },
  })
}

export function useDeleteAssistantConversation(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => assistantService.deleteConversation(conversationId),
    onSuccess: (_data, conversationId) => {
      qc.invalidateQueries({ queryKey: conversationsKey(organizationId) })
      qc.removeQueries({ queryKey: messagesKey(conversationId) })
    },
  })
}
