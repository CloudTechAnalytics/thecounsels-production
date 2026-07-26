import { supabase } from '@/shared/lib/supabase'
import { administrationService } from '@/features/administration/services/administration.service'
import type { MemberWithRelations } from '@/features/administration/types'

export interface ReportInvoice {
  id: string
  total: number
  amount_paid: number
  status: string
  issue_date: string
  due_date: string | null
  client_id: string | null
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
}
export interface ReportData {
  invoices: ReportInvoice[]
  timeEntries: ReportTime[]
  expenses: ReportExpense[]
  matters: ReportMatter[]
  tasks: { status: string; assignee_id: string | null; due_date: string | null }[]
  clients: { id: string; display_name: string; type: string }[]
  members: MemberWithRelations[]
}

export const reportsService = {
  async getReportData(orgId: string): Promise<ReportData> {
    const [invoices, timeEntries, expenses, matters, tasks, clients, members] = await Promise.all([
      supabase.from('invoices').select('id,total,amount_paid,status,issue_date,due_date,client_id').eq('organization_id', orgId),
      supabase.from('time_entries').select('minutes,rate,billable,invoiced,user_id,matter_id').eq('organization_id', orgId),
      supabase.from('expenses').select('amount,billable,invoiced,matter_id').eq('organization_id', orgId),
      supabase.from('matters').select('id,status,practice_area,lead_lawyer_id,client_id,title,matter_number,opened_on').eq('organization_id', orgId),
      supabase.from('tasks').select('status,assignee_id,due_date').eq('organization_id', orgId),
      supabase.from('clients').select('id,display_name,type').eq('organization_id', orgId),
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
      tasks: (tasks.data ?? []) as unknown as { status: string; assignee_id: string | null; due_date: string | null }[],
      clients: (clients.data ?? []) as unknown as { id: string; display_name: string; type: string }[],
      members,
    }
  },
}
