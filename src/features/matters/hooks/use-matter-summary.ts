import { useQuery } from '@tanstack/react-query'
import { mattersService } from '@/features/matters/services/matters.service'

export function useMatterSummary(matterId: string | undefined) {
  return useQuery({
    queryKey: ['matter-summary', matterId],
    enabled: Boolean(matterId),
    queryFn: () => mattersService.getSummary(matterId!),
  })
}
