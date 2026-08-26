import { supabase } from '@/shared/lib/supabase'

export interface ClientErrorLogRow {
  id: string
  organization_id: string | null
  message: string
  stack: string | null
  component_stack: string | null
  url: string | null
  user_agent: string | null
  environment: string | null
  context: { source?: string; [key: string]: unknown } | null
  created_at: string
  organization: { id: string; name: string } | null
}

export interface ErrorLogFilters {
  search?: string
  environment?: string | 'all'
}
export interface ErrorLogPage {
  rows: ClientErrorLogRow[]
  total: number
}
export const ERROR_LOGS_PAGE_SIZE = 25

const SELECT = '*, organization:organizations(id, name)'

/** client_error_logs (0120) — see shared/lib/error-log.ts for the writer
 * side. SELECT/DELETE are both platform-admin-only at the RLS layer
 * (0120, 0130); this service assumes that's already true rather than
 * re-checking here. */
export const errorLogsService = {
  async list(filters: ErrorLogFilters = {}, pagination?: { page: number; pageSize: number }): Promise<ErrorLogPage> {
    let q = supabase.from('client_error_logs').select(SELECT, { count: 'exact' }).order('created_at', { ascending: false })
    if (filters.environment && filters.environment !== 'all') q = q.eq('environment', filters.environment)
    if (filters.search?.trim()) q = q.ilike('message', `%${filters.search.trim()}%`)

    if (pagination) {
      const from = (pagination.page - 1) * pagination.pageSize
      q = q.range(from, from + pagination.pageSize - 1)
    } else {
      q = q.range(0, 999)
    }

    const { data, error, count } = await q
    if (error) throw error
    return { rows: (data ?? []) as unknown as ClientErrorLogRow[], total: count ?? 0 }
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('client_error_logs').delete().eq('id', id)
    if (error) throw error
  },

  async clearAll(): Promise<void> {
    // RLS already scopes every row here to platform-admin visibility —
    // .gt() on a timestamp column is just a real filter PostgREST accepts
    // for "every row" without a bare unfiltered delete.
    const { error } = await supabase.from('client_error_logs').delete().gt('created_at', '1970-01-01')
    if (error) throw error
  },
}
