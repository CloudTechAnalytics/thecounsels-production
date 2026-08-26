import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantService, type AssistantMessageRow } from '@/shared/services/assistant.service'

export function useAssistantMessages(organizationId: string | null) {
  return useQuery({
    queryKey: ['assistant-messages', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => assistantService.listMessages(organizationId!),
  })
}

export function useSendAssistantMessage(organizationId: string | null) {
  const qc = useQueryClient()
  const key = ['assistant-messages', organizationId]
  return useMutation({
    mutationFn: (message: string) => assistantService.sendMessage(organizationId!, message),
    // See use-matter-ai.ts's own comment — same optimistic echo, same reason:
    // the real insert only happens once the reply is ready server-side.
    onMutate: async (message: string) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<AssistantMessageRow[]>(key)
      const optimistic: AssistantMessageRow = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<AssistantMessageRow[]>(key, (old) => [...(old ?? []), optimistic])
      return { previous }
    },
    onError: (_err, _message, context) => {
      if (context) qc.setQueryData(key, context.previous)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useClearAssistantMessages(organizationId: string | null) {
  const qc = useQueryClient()
  const key = ['assistant-messages', organizationId]
  return useMutation({
    mutationFn: () => assistantService.clearMessages(organizationId!),
    onSuccess: () => qc.setQueryData(key, []),
  })
}
