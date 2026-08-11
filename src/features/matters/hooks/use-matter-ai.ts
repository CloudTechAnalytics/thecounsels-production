import { useMutation, useQueryClient } from '@tanstack/react-query'
import { matterAiService } from '@/features/matters/services/matter-ai.service'

export function useSummarizeMatter(matterId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => matterAiService.summarizeMatter(matterId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['matter', matterId] }),
  })
}
