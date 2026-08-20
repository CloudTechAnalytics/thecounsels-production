import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { assistantService } from '@/shared/services/assistant.service'

export function useAssistantMessages(organizationId: string | null) {
  return useQuery({
    queryKey: ['assistant-messages', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => assistantService.listMessages(organizationId!),
  })
}

export function useSendAssistantMessage(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => assistantService.sendMessage(organizationId!, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant-messages', organizationId] }),
  })
}
