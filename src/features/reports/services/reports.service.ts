import { supabase } from '@/shared/lib/supabase'
import { administrationService } from '@/features/administration/services/administration.service'
import type { MemberWithRelations } from '@/features/administration/types'
import type { MatterStatus } from '@/shared/types/database.types'

export interface ReportInvoice {
  id: string
  total: number
  amount_paid: number
  status: string
  issue_date: string
  due_date: string | null
  client_id: string | null
  matter_id: string | null
}
export interface ReportTime {
  minutes: number
  rate: number
  billable: boolean
  invoiced: boolean
  user_id: string | null
  matter_id: string | null
}
export interface ReportExpense {
  amount: number
  billable: boolean
  invoiced: boolean
  matter_id: string | null
}
export interface ReportMatter {
  id: string
  status: string
  practice_area: string | null
  lead_lawyer_id: string | null
  client_id: string | null
  title: string
  matter_number: string | null
  opened_on: string
  court: string | null
}
export interface ReportData {
  invoices: ReportInvoice[]
  timeEntries: ReportTime[]
  expenses: ReportExpense[]
  matters: ReportMatter[]
  tasks: { status: string; assignee_id: string | null; due_date: string | null; matter_id: string | null }[]
  clients: { id: string; display_name: string; type: string }[]
  members: MemberWithRelations[]
}

export interface ReportFilters {
  dateFrom?: string
  dateTo?: string
  lawyerId?: string | 'all'
  clientId?: string | 'all'
  matterId?: string | 'all'
  practiceArea?: string | 'all'
  court?: string
  status?: MatterStatus | 'all'
}

export interface ReportKpis {
  activeMatters: number
  closedMatters: number
  activeClients: number
  newClients: number
  billableHours: number
  revenue: number
  outstandingInvoices: number
  hearingsThisWeek: number
  tasksDue: number
}

const ACTIVE_STATUSES = ['open', 'pending', 'in_court']
const CLOSED_STATUSES = ['closed', 'won', 'lost']

/** True when a filter narrows *which matters* we're talking about (not lawyer/date, which apply per-entity). */
function hasMatterScope(filters: ReportFilters): boolean {
  return Boolean(
    (filters.clientId && filters.clientId !== 'all') ||
    (filters.matterId && filters.matterId !== 'all') ||
    (filters.practiceArea && filters.practiceArea !== 'all') ||
    filters.court?.trim() ||
    (filters.status && filters.status !== 'all'),
  )
}

/** Resolves the matter ids matching client/matter/practiceArea/court/status filters, for narrowing child entities. Returns null when no such filter is active. */
async function resolveMatterIds(orgId: string, filters: ReportFilters): Promise<string[] | null> {
  if (!hasMatterScope(filters)) return null
  let q = supabase.from('matters').select('id').eq('organization_id', orgId)
  if (filters.clientId && filters.clientId !== 'all') q = q.eq('client_id', filters.clientId)
  if (filters.matterId && filters.matterId !== 'all') q = q.eq('id', filters.matterId)
  if (filters.practiceArea && filters.practiceArea !== 'all') q = q.eq('practice_area', filters.practiceArea)
  if (filters.court?.trim()) q = q.ilike('court', `%${filters.court.trim()}%`)
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((m) => m.id)
}

export const reportsService = {
  async getReportData(orgId: string, filters: ReportFilters = {}): Promise<ReportData> {
    const matterIds = await resolveMatterIds(orgId, filters)
    if (matterIds !== null && matterIds.length === 0) {
      return { invoices: [], timeEntries: [], expenses: [], matters: [], tasks: [], clients: [], members: [] }
    }

    let mattersQ = supabase
      .from('matters')
      .select('id,status,practice_area,lead_lawyer_id,client_id,title,matter_number,opened_on,court')
      .eq('organization_id', orgId)
    if (filters.clientId && filters.clientId !== 'all') mattersQ = mattersQ.eq('client_id', filters.clientId)
    if (filters.matterId && filters.matterId !== 'all') mattersQ = mattersQ.eq('id', filters.matterId)
    if (filters.practiceArea && filters.practiceArea !== 'all') mattersQ = mattersQ.eq('practice_area', filters.practiceArea)
    if (filters.court?.trim()) mattersQ = mattersQ.ilike('court', `%${filters.court.trim()}%`)
    if (filters.status && filters.status !== 'all') mattersQ = mattersQ.eq('status', filters.status)
    if (filters.lawyerId && filters.lawyerId !== 'all') mattersQ = mattersQ.eq('lead_lawyer_id', filters.lawyerId)
    if (filters.dateFrom) mattersQ = mattersQ.gte('opened_on', filters.dateFrom)
    if (filters.dateTo) mattersQ = mattersQ.lte('opened_on', filters.dateTo)

    let timeQ = supabase.from('time_entries').select('minutes,rate,billable,invoiced,user_id,matter_id').eq('organization_id', orgId)
    if (matterIds) timeQ = timeQ.in('matter_id', matterIds)
    if (filters.lawyerId && filters.lawyerId !== 'all') timeQ = timeQ.eq('user_id', filters.lawyerId)
    if (filters.dateFrom) timeQ = timeQ.gte('work_date', filters.dateFrom)
    if (filters.dateTo) timeQ = timeQ.lte('work_date', filters.dateTo)

    let expQ = supabase.from('expenses').select('amount,billable,invoiced,matter_id').eq('organization_id', orgId)
    if (matterIds) expQ = expQ.in('matter_id', matterIds)
    if (filters.dateFrom) expQ = expQ.gte('expense_date', filters.dateFrom)
    if (filters.dateTo) expQ = expQ.lte('expense_date', filters.dateTo)

    let tasksQ = supabase.from('tasks').select('status,assignee_id,due_date,matter_id').eq('organization_id', orgId)
    if (matterIds) tasksQ = tasksQ.in('matter_id', matterIds)
    if (filters.lawyerId && filters.lawyerId !== 'all') tasksQ = tasksQ.eq('assignee_id', filters.lawyerId)
    if (filters.dateFrom) tasksQ = tasksQ.gte('due_date', filters.dateFrom)
    if (filters.dateTo) tasksQ = tasksQ.lte('due_date', filters.dateTo)

    let invQ = supabase.from('invoices').select('id,total,amount_paid,status,issue_date,due_date,client_id,matter_id').eq('organization_id', orgId)
    if (matterIds) invQ = invQ.in('matter_id', matterIds)
    if (filters.clientId && filters.clientId !== 'all') invQ = invQ.eq('client_id', filters.clientId)
    if (filters.dateFrom) invQ = invQ.gte('issue_date', filters.dateFrom)
    if (filters.dateTo) invQ = invQ.lte('issue_date', filters.dateTo)

    let clientsQ = supabase.from('clients').select('id,display_name,type').eq('organization_id', orgId)
    if (filters.clientId && filters.clientId !== 'all') clientsQ = clientsQ.eq('id', filters.clientId)

    const [invoices, timeEntries, expenses, matters, tasks, clients, members] = await Promise.all([
      invQ,
      timeQ,
      expQ,
      mattersQ,
      tasksQ,
      clientsQ,
      administrationService.listMembers(orgId),
    ])
    for (const r of [invoices, timeEntries, expenses, matters, tasks, clients]) {
      if (r.error) throw r.error
    }
    return {
      invoices: (invoices.data ?? []) as unknown as ReportInvoice[],
      timeEntries: (timeEntries.data ?? []) as unknown as ReportTime[],
      expenses: (expenses.data ?? []) as unknown as ReportExpense[],
      matters: (matters.data ?? []) as unknown as ReportMatter[],
      tasks: (tasks.data ?? []) as unknown as { status: string; assignee_id: string | null; due_date: string | null; matter_id: string | null }[],
      clients: (clients.data ?? []) as unknown as { id: string; display_name: string; type: string }[],
      members,
    }
  },

  async getKpis(orgId: string, filters: ReportFilters = {}): Promise<ReportKpis> {
    const matterIds = await resolveMatterIds(orgId, filters)
    const matterScopeEmpty = matterIds !== null && matterIds.length === 0

    // Matters — Active/Closed. Lawyer + date (opened_on) apply here directly, since this
    // *is* the matters query, unlike the other KPIs which narrow via matterIds instead.
    let mattersQ = supabase.from('matters').select('id,status').eq('organization_id', orgId)
    if (filters.clientId && filters.clientId !== 'all') mattersQ = mattersQ.eq('client_id', filters.clientId)
    if (filters.matterId && filters.matterId !== 'all') mattersQ = mattersQ.eq('id', filters.matterId)
    if (filters.practiceArea && filters.practiceArea !== 'all') mattersQ = mattersQ.eq('practice_area', filters.practiceArea)
    if (filters.court?.trim()) mattersQ = mattersQ.ilike('court', `%${filters.court.trim()}%`)
    if (filters.status && filters.status !== 'all') mattersQ = mattersQ.eq('status', filters.status)
    if (filters.lawyerId && filters.lawyerId !== 'all') mattersQ = mattersQ.eq('lead_lawyer_id', filters.lawyerId)
    if (filters.dateFrom) mattersQ = mattersQ.gte('opened_on', filters.dateFrom)
    if (filters.dateTo) mattersQ = mattersQ.lte('opened_on', filters.dateTo)

    let activeClientsQ = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'active')
    if (filters.clientId && filters.clientId !== 'all') activeClientsQ = activeClientsQ.eq('id', filters.clientId)

    let newClientsQ = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)
    if (filters.clientId && filters.clientId !== 'all') newClientsQ = newClientsQ.eq('id', filters.clientId)
    if (filters.dateFrom) newClientsQ = newClientsQ.gte('created_at', filters.dateFrom)
    if (filters.dateTo) newClientsQ = newClientsQ.lte('created_at', filters.dateTo)

    let timeQ = matterScopeEmpty
      ? null
      : supabase.from('time_entries').select('minutes,billable').eq('organization_id', orgId).eq('billable', true)
    if (timeQ && matterIds) timeQ = timeQ.in('matter_id', matterIds)
    if (timeQ && filters.lawyerId && filters.lawyerId !== 'all') timeQ = timeQ.eq('user_id', filters.lawyerId)
    if (timeQ && filters.dateFrom) timeQ = timeQ.gte('work_date', filters.dateFrom)
    if (timeQ && filters.dateTo) timeQ = timeQ.lte('work_date', filters.dateTo)

    let invQ = matterScopeEmpty
      ? null
      : supabase.from('invoices').select('total,amount_paid,status').eq('organization_id', orgId).not('status', 'in', '(void,draft)')
    if (invQ && matterIds) invQ = invQ.in('matter_id', matterIds)
    if (invQ && filters.clientId && filters.clientId !== 'all') invQ = invQ.eq('client_id', filters.clientId)
    if (invQ && filters.dateFrom) invQ = invQ.gte('issue_date', filters.dateFrom)
    if (invQ && filters.dateTo) invQ = invQ.lte('issue_date', filters.dateTo)

    // Hearings this week — a fixed rolling 7-day window, deliberately independent of the
    // report's own date range filter (mirrors the Dashboard's "Hearings this week" tile).
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)
    let hearingsQ = matterScopeEmpty
      ? null
      : supabase
          .from('hearings')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .neq('status', 'cancelled')
          .gte('hearing_at', weekStart.toISOString())
          .lt('hearing_at', weekEnd.toISOString())
    if (hearingsQ && matterIds) hearingsQ = hearingsQ.in('matter_id', matterIds)

    let tasksQ = matterScopeEmpty
      ? null
      : supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).not('status', 'in', '(done,cancelled)').not('due_date', 'is', null)
    if (tasksQ && matterIds) tasksQ = tasksQ.in('matter_id', matterIds)
    if (tasksQ && filters.lawyerId && filters.lawyerId !== 'all') tasksQ = tasksQ.eq('assignee_id', filters.lawyerId)
    if (tasksQ && filters.dateFrom) tasksQ = tasksQ.gte('due_date', filters.dateFrom)
    if (tasksQ && filters.dateTo) tasksQ = tasksQ.lte('due_date', filters.dateTo)

    const [mattersRes, activeClientsRes, newClientsRes, timeRes, invRes, hearingsRes, tasksRes] = await Promise.all([
      mattersQ,
      activeClientsQ,
      newClientsQ,
      timeQ ?? Promise.resolve({ data: [], error: null }),
      invQ ?? Promise.resolve({ data: [], error: null }),
      hearingsQ ?? Promise.resolve({ count: 0, error: null }),
      tasksQ ?? Promise.resolve({ count: 0, error: null }),
    ])
    for (const r of [mattersRes, activeClientsRes, newClientsRes, timeRes, invRes, hearingsRes, tasksRes]) {
      if (r.error) throw r.error
    }

    const matterRows = (mattersRes.data ?? []) as { id: string; status: string }[]
    const timeRows = (timeRes.data ?? []) as { minutes: number; billable: boolean }[]
    const invRows = (invRes.data ?? []) as { total: number; amount_paid: number }[]

    return {
      activeMatters: matterRows.filter((m) => ACTIVE_STATUSES.includes(m.status)).length,
      closedMatters: matterRows.filter((m) => CLOSED_STATUSES.includes(m.status)).length,
      activeClients: activeClientsRes.count ?? 0,
      newClients: newClientsRes.count ?? 0,
      billableHours: Math.round((timeRows.reduce((s, t) => s + t.minutes, 0) / 60) * 10) / 10,
      revenue: invRows.reduce((s, i) => s + Number(i.total), 0),
      outstandingInvoices: invRows.reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0),
      hearingsThisWeek: hearingsRes.count ?? 0,
      tasksDue: tasksRes.count ?? 0,
    }
  },
}
