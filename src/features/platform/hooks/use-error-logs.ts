import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { errorLogsService, ERROR_LOGS_PAGE_SIZE, type ErrorLogFilters } from '@/features/platform/services/error-logs.service'

const keys = {
  list: (filters: ErrorLogFilters, page: number) => ['platform', 'error-logs', filters, page] as const,
}

export function useErrorLogs(filters: ErrorLogFilters, page: number, pageSize = ERROR_LOGS_PAGE_SIZE) {
  return useQuery({
    queryKey: keys.list(filters, page),
    queryFn: () => errorLogsService.list(filters, { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['platform', 'error-logs'] })
}

export function useDeleteErrorLog() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => errorLogsService.remove(id), onSuccess: invalidate })
}

export function useClearErrorLogs() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: () => errorLogsService.clearAll(), onSuccess: invalidate })
}
