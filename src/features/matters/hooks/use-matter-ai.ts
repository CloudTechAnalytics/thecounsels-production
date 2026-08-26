import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { matterAiService, type MatterAiChatMessageRow } from '@/features/matters/services/matter-ai.service'

export function useSummarizeMatter(matterId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => matterAiService.summarizeMatter(matterId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter', matterId] }),
  })
}

export function useMatterAiChat(matterId: string | undefined) {
  return useQuery({
    queryKey: ['matter-ai-chat', matterId],
    enabled: Boolean(matterId),
    queryFn: () => matterAiService.listChatMessages(matterId!),
  })
}

export function useSendMatterAiChatMessage(matterId: string | undefined) {
  const qc = useQueryClient()
  const key = ['matter-ai-chat', matterId]
  return useMutation({
    mutationFn: (message: string) => matterAiService.sendChatMessage(matterId!, message),
    // Echo the user's own message into the thread immediately — the actual
    // insert only happens server-side once the AI reply is ready (see the
    // service's own comment), which used to mean the question sat invisible
    // in the composer for the entire Gemini round-trip before appearing at
    // the same instant as the reply. This is purely a local render, not a
    // write — reconciled with the real row (or rolled back) below.
    onMutate: async (message: string) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<MatterAiChatMessageRow[]>(key)
      const optimistic: MatterAiChatMessageRow = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<MatterAiChatMessageRow[]>(key, (old) => [...(old ?? []), optimistic])
      return { previous }
    },
    onError: (_err, _message, context) => {
      if (context) qc.setQueryData(key, context.previous)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useClearMatterAiChat(matterId: string | undefined) {
  const qc = useQueryClient()
  const key = ['matter-ai-chat', matterId]
  return useMutation({
    mutationFn: () => matterAiService.clearChatMessages(matterId!),
    onSuccess: () => qc.setQueryData(key, []),
  })
}
