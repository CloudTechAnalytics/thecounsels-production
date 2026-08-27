import { supabase } from '@/shared/lib/supabase'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'
import type { DataExportStatus } from '@/shared/types/database.types'

export interface DataExportRequestRow {
  id: string
  organization_id: string
  requested_by: string | null
  status: DataExportStatus
  file_path: string | null
  error: string | null
  requested_at: string
  completed_at: string | null
  expires_at: string | null
  requester: { id: string; full_name: string | null } | null
}

export const dataExportService = {
  /** RLS (0134) already scopes this to organization.manage holders — a
   * member without it simply sees none, no separate check needed here. */
  async listRequests(organizationId: string): Promise<DataExportRequestRow[]> {
    const { data, error } = await supabase
      .from('data_export_requests')
      .select('*, requester:profiles!data_export_requests_requested_by_fkey(id, full_name)')
      .eq('organization_id', organizationId)
      .order('requested_at', { ascending: false })
      .limit(10)
    if (error) throw error
    return (data ?? []) as unknown as DataExportRequestRow[]
  },

  /** Kicks off generate-data-export — synchronous from the caller's POV
   * (the Edge Function does the assembly work before responding), but the
   * UI still polls listRequests() rather than trusting this call's return
   * value alone, in case of a timeout on a very large export. */
  requestExport(organizationId: string): Promise<{ requestId: string; status: string }> {
    return invokeEdgeFunction('generate-data-export', { organizationId })
  },

  async getDownloadUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from('data-exports').createSignedUrl(filePath, 3600)
    if (error) throw error
    return data.signedUrl
  },
}
