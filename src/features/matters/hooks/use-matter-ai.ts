import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { matterAiService } from '@/features/matters/services/matter-ai.service'

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
  return useMutation({
    mutationFn: (message: string) => matterAiService.sendChatMessage(matterId!, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter-ai-chat', matterId] }),
  })
}
