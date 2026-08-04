import { useQuery } from '@tanstack/react-query'
import { reportsService, type ReportFilters } from '@/features/reports/services/reports.service'

export function useReportData(orgId: string | null, filters: ReportFilters = {}) {
  return useQuery({
    queryKey: ['reports', orgId, 'data', filters],
    enabled: Boolean(orgId),
    queryFn: () => reportsService.getReportData(orgId!, filters),
  })
}

export function useReportKpis(orgId: string | null, filters: ReportFilters = {}) {
  return useQuery({
    queryKey: ['reports', orgId, 'kpis', filters],
    enabled: Boolean(orgId),
    queryFn: () => reportsService.getKpis(orgId!, filters),
  })
}
