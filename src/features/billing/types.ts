import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Client, Expense, Invoice, InvoiceItem, Matter, Payment, Profile, TimeEntry } from '@/shared/types/database.types'

export interface TimeEntryRow extends TimeEntry {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  user: Pick<Profile, 'id' | 'full_name'> | null
}
export interface ExpenseRow extends Expense {
  matter: Pick<Matter, 'id' | 'title' | 'matter_number'> | null
  user: Pick<Profile, 'id' | 'full_name'> | null
}
export interface InvoiceRow extends Invoice {
  client: Pick<Client, 'id' | 'display_name'> | null
  matter: Pick<Matter, 'id' | 'matter_number'> | null
}
export interface InvoiceDetail extends InvoiceRow {
  items: InvoiceItem[]
  payments: Payment[]
}

export interface BillingStats {
  unbilledValue: number
  invoiced: number
  collected: number
  outstanding: number
  billableHoursMTD: number
  revenueMTD: number
}

/** A single member's own numbers — shown to users without `reports.financial`. */
export interface PersonalStats {
  billableHoursMTD: number
  unbilledValue: number
  expensesMTD: number
  openTasks: number
}

export const INVOICE_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  draft: { label: 'Draft', variant: 'muted' },
  sent: { label: 'Sent', variant: 'warning' },
  paid: { label: 'Paid', variant: 'success' },
  void: { label: 'Void', variant: 'muted' },
}

export const EXPENSE_CATEGORIES = ['Filing fees', 'Travel', 'Courier', 'Printing', 'Expert fees', 'Other'] as const

export function timeAmount(minutes: number, rate: number): number {
  return Math.round((minutes / 60) * rate * 100) / 100
}
