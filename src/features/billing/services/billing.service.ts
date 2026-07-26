import { supabase } from '@/shared/lib/supabase'
import type { InvoiceStatus } from '@/shared/types/database.types'
import { timeAmount, type BillingStats, type ExpenseRow, type InvoiceDetail, type InvoiceRow, type PersonalStats, type TimeEntryRow } from '@/features/billing/types'
import type { ExpenseFormValues, GenerateInvoiceFormValues, PaymentFormValues, TimeEntryFormValues } from '@/features/billing/schemas'

const TIME_SELECT = '*, matter:matters(id, title, matter_number), user:profiles!time_entries_user_id_fkey(id, full_name)'
const EXP_SELECT = '*, matter:matters(id, title, matter_number), user:profiles!expenses_user_id_fkey(id, full_name)'
const INV_SELECT = '*, client:clients(id, display_name), matter:matters(id, matter_number)'

export const billingService = {
  // Time entries --------------------------------------------------------------
  async listUnbilledTime(organizationId: string): Promise<TimeEntryRow[]> {
    const { data, error } = await supabase
      .from('time_entries')
      .select(TIME_SELECT)
      .eq('organization_id', organizationId)
      .eq('invoiced', false)
      .order('work_date', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as TimeEntryRow[]
  },
  async addTimeEntry(organizationId: string, v: TimeEntryFormValues, userId: string | null): Promise<void> {
    const { error } = await supabase.from('time_entries').insert({
      organization_id: organizationId,
      matter_id: v.matterId || null,
      user_id: userId,
      work_date: v.workDate,
      minutes: Math.round(v.hours * 60),
      rate: v.rate,
      description: v.description.trim(),
      billable: v.billable,
    })
    if (error) throw error
  },
  async deleteTimeEntry(id: string): Promise<void> {
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) throw error
  },

  // Expenses ------------------------------------------------------------------
  async listUnbilledExpenses(organizationId: string): Promise<ExpenseRow[]> {
    const { data, error } = await supabase
      .from('expenses')
      .select(EXP_SELECT)
      .eq('organization_id', organizationId)
      .eq('invoiced', false)
      .order('expense_date', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as ExpenseRow[]
  },
  async addExpense(organizationId: string, v: ExpenseFormValues, userId: string | null): Promise<void> {
    const { error } = await supabase.from('expenses').insert({
      organization_id: organizationId,
      matter_id: v.matterId || null,
      user_id: userId,
      expense_date: v.expenseDate,
      amount: v.amount,
      description: v.description.trim(),
      category: v.category || null,
      billable: v.billable,
    })
    if (error) throw error
  },
  async deleteExpense(id: string): Promise<void> {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
  },

  // Invoices ------------------------------------------------------------------
  async listInvoices(organizationId: string): Promise<InvoiceRow[]> {
    const { data, error } = await supabase
      .from('invoices')
      .select(INV_SELECT)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as InvoiceRow[]
  },
  async getInvoice(id: string): Promise<InvoiceDetail> {
    const [{ data: inv, error: e1 }, { data: items, error: e2 }, { data: payments, error: e3 }] = await Promise.all([
      supabase.from('invoices').select(INV_SELECT).eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('created_at', { ascending: true }),
      supabase.from('payments').select('*').eq('invoice_id', id).order('paid_at', { ascending: false }),
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (e3) throw e3
    return { ...(inv as unknown as InvoiceRow), items: items ?? [], payments: payments ?? [] }
  },
  async generateInvoice(organizationId: string, v: GenerateInvoiceFormValues): Promise<string> {
    const { data, error } = await supabase.rpc('generate_invoice', {
      p_org: organizationId,
      p_client: v.clientId,
      p_matter: v.matterId || null,
      p_due_date: v.dueDate || null,
      p_tax_rate: v.taxRate,
    })
    if (error) throw error
    return (data as { id: string }).id
  },
  async setInvoiceStatus(id: string, status: InvoiceStatus, organizationId: string): Promise<void> {
    const { error } = await supabase.from('invoices').update({ status }).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: `invoice.${status}`,
      p_entity_type: 'invoice',
      p_entity_id: id,
      p_summary: `Invoice marked ${status}`,
    })
  },

  // Payments ------------------------------------------------------------------
  async addPayment(organizationId: string, invoiceId: string, v: PaymentFormValues, userId: string | null): Promise<void> {
    const { error } = await supabase.from('payments').insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      amount: v.amount,
      method: v.method || null,
      reference: v.reference || null,
      paid_at: v.paidAt,
      created_by: userId,
    })
    if (error) throw error
  },

  // Dashboard -----------------------------------------------------------------
  async getStats(organizationId: string): Promise<BillingStats> {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    const [time, exp, inv] = await Promise.all([
      supabase.from('time_entries').select('minutes, rate, billable, invoiced, work_date').eq('organization_id', organizationId),
      supabase.from('expenses').select('amount, billable, invoiced').eq('organization_id', organizationId),
      supabase.from('invoices').select('total, amount_paid, status, issue_date').eq('organization_id', organizationId),
    ])

    const timeRows = time.data ?? []
    const expRows = exp.data ?? []
    const invRows = inv.data ?? []

    const unbilledTime = timeRows.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0)
    const unbilledExp = expRows.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)
    const nonVoid = invRows.filter((i) => i.status !== 'void' && i.status !== 'draft')
    const invoiced = nonVoid.reduce((s, i) => s + Number(i.total), 0)
    const collected = nonVoid.reduce((s, i) => s + Number(i.amount_paid), 0)
    const billableMinutesMTD = timeRows.filter((t) => t.billable && t.work_date >= monthStartStr).reduce((s, t) => s + t.minutes, 0)
    const revenueMTD = invRows.filter((i) => i.status !== 'void' && i.issue_date >= monthStartStr).reduce((s, i) => s + Number(i.total), 0)

    return {
      unbilledValue: unbilledTime + unbilledExp,
      invoiced,
      collected,
      outstanding: invoiced - collected,
      billableHoursMTD: Math.round((billableMinutesMTD / 60) * 10) / 10,
      revenueMTD,
    }
  },

  /** One member's own numbers — the non-financial alternative to getStats. */
  async getPersonalStats(organizationId: string, userId: string): Promise<PersonalStats> {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const monthStartStr = monthStart.toISOString().slice(0, 10)

    const [time, exp, tasks] = await Promise.all([
      supabase
        .from('time_entries')
        .select('minutes, rate, billable, invoiced, work_date')
        .eq('organization_id', organizationId)
        .eq('user_id', userId),
      supabase
        .from('expenses')
        .select('amount, billable, invoiced, expense_date')
        .eq('organization_id', organizationId)
        .eq('user_id', userId),
      supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('assignee_id', userId)
        .neq('status', 'done'),
    ])
    if (time.error) throw time.error
    if (exp.error) throw exp.error
    if (tasks.error) throw tasks.error

    const timeRows = time.data ?? []
    const expRows = exp.data ?? []
    const billableMinutesMTD = timeRows.filter((t) => t.billable && t.work_date >= monthStartStr).reduce((s, t) => s + t.minutes, 0)
    const unbilledTime = timeRows.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0)
    const unbilledExp = expRows.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)
    const expensesMTD = expRows.filter((e) => e.expense_date >= monthStartStr).reduce((s, e) => s + Number(e.amount), 0)

    return {
      billableHoursMTD: Math.round((billableMinutesMTD / 60) * 10) / 10,
      unbilledValue: unbilledTime + unbilledExp,
      expensesMTD,
      openTasks: tasks.count ?? 0,
    }
  },
}
