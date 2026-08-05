import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { billingService, TIME_ENTRIES_PAGE_SIZE, type TimeEntryFilters } from '@/features/billing/services/billing.service'
import type {
  ExpenseFormValues,
  GenerateInvoiceFormValues,
  InvoiceItemFormValues,
  PaymentFormValues,
  TimeEntryFormValues,
  UpdateInvoiceDraftFormValues,
} from '@/features/billing/schemas'
import type { InvoiceStatus } from '@/shared/types/database.types'

export function useBillingStats(orgId: string | null) {
  return useQuery({ queryKey: ['billing', orgId, 'stats'], enabled: Boolean(orgId), queryFn: () => billingService.getStats(orgId!) })
}
export function usePersonalStats(orgId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['billing', orgId, 'personal-stats', userId],
    enabled: Boolean(orgId && userId),
    queryFn: () => billingService.getPersonalStats(orgId!, userId!),
  })
}
export function useTimeEntries(orgId: string | null, filters: TimeEntryFilters, page: number, pageSize = TIME_ENTRIES_PAGE_SIZE) {
  return useQuery({
    queryKey: ['billing', orgId, 'time', filters, page, pageSize],
    enabled: Boolean(orgId),
    queryFn: () => billingService.listTimeEntries(orgId!, filters, { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}
export function useUnbilledExpenses(orgId: string | null) {
  return useQuery({ queryKey: ['billing', orgId, 'expenses'], enabled: Boolean(orgId), queryFn: () => billingService.listUnbilledExpenses(orgId!) })
}
export function useInvoices(orgId: string | null) {
  return useQuery({ queryKey: ['billing', orgId, 'invoices'], enabled: Boolean(orgId), queryFn: () => billingService.listInvoices(orgId!) })
}
export function useInvoice(id: string | undefined) {
  return useQuery({ queryKey: ['invoice', id], enabled: Boolean(id), queryFn: () => billingService.getInvoice(id!) })
}

function useInvalidate(orgId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['billing', orgId] })
    qc.invalidateQueries({ queryKey: ['reports'] })
  }
}

/** Shared invalidation for anything that mutates a single invoice in place (line items, draft edits, status). */
function useInvalidateInvoice(orgId: string | null) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(orgId)
  return (invoiceId: string) => {
    invalidate()
    qc.invalidateQueries({ queryKey: ['invoice', invoiceId] })
    qc.invalidateQueries({ queryKey: ['matter-summary'] })
  }
}

export function useAddTimeEntry(orgId: string | null, userId: string | null) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: TimeEntryFormValues) => billingService.addTimeEntry(orgId!, v, userId),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['matter-summary'] })
    },
  })
}
export function useUpdateTimeEntry(orgId: string | null) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: TimeEntryFormValues }) => billingService.updateTimeEntry(id, orgId!, values),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['matter-summary'] })
    },
  })
}
export function useReopenTimeEntry(orgId: string | null) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (id: string) => billingService.reopenTimeEntry(id, orgId!),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['matter-summary'] })
    },
  })
}
export function useAddExpense(orgId: string | null, userId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (v: ExpenseFormValues) => billingService.addExpense(orgId!, v, userId), onSuccess: invalidate })
}
export function useDeleteTimeEntry(orgId: string | null) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (id: string) => billingService.deleteTimeEntry(id, orgId!),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['matter-summary'] })
    },
  })
}
export function useDeleteExpense(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (id: string) => billingService.deleteExpense(id, orgId!), onSuccess: invalidate })
}
export function useGenerateInvoice(orgId: string | null) {
  const qc = useQueryClient()
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (v: GenerateInvoiceFormValues) => billingService.generateInvoice(orgId!, v),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['matter-summary'] })
    },
  })
}
export function useSetInvoiceStatus(orgId: string | null) {
  const invalidateInvoice = useInvalidateInvoice(orgId)
  return useMutation({
    mutationFn: ({ id, status, voidReason }: { id: string; status: InvoiceStatus; voidReason?: string }) =>
      billingService.setInvoiceStatus(id, status, orgId!, voidReason),
    onSuccess: (_d, vars) => invalidateInvoice(vars.id),
  })
}
export function useDeleteInvoice(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: (id: string) => billingService.deleteInvoice(id, orgId!),
    onSuccess: invalidate,
  })
}
export function useAddInvoiceItem(orgId: string | null) {
  const invalidateInvoice = useInvalidateInvoice(orgId)
  return useMutation({
    mutationFn: ({ invoiceId, values }: { invoiceId: string; values: InvoiceItemFormValues }) =>
      billingService.addInvoiceItem(orgId!, invoiceId, values),
    onSuccess: (_d, vars) => invalidateInvoice(vars.invoiceId),
  })
}
export function useUpdateInvoiceItem(orgId: string | null) {
  const invalidateInvoice = useInvalidateInvoice(orgId)
  return useMutation({
    mutationFn: ({ itemId, invoiceId, values }: { itemId: string; invoiceId: string; values: InvoiceItemFormValues }) =>
      billingService.updateInvoiceItem(itemId, invoiceId, orgId!, values),
    onSuccess: (_d, vars) => invalidateInvoice(vars.invoiceId),
  })
}
export function useRemoveInvoiceItem(orgId: string | null) {
  const invalidateInvoice = useInvalidateInvoice(orgId)
  return useMutation({
    mutationFn: ({ itemId, invoiceId, description }: { itemId: string; invoiceId: string; description: string }) =>
      billingService.removeInvoiceItem(itemId, invoiceId, orgId!, description),
    onSuccess: (_d, vars) => invalidateInvoice(vars.invoiceId),
  })
}
export function useUpdateInvoiceDraft(orgId: string | null) {
  const invalidateInvoice = useInvalidateInvoice(orgId)
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateInvoiceDraftFormValues }) =>
      billingService.updateInvoiceDraft(id, orgId!, values),
    onSuccess: (_d, vars) => invalidateInvoice(vars.id),
  })
}
export function useAddPayment(orgId: string | null, userId: string | null) {
  const invalidateInvoice = useInvalidateInvoice(orgId)
  return useMutation({
    mutationFn: ({ invoiceId, values }: { invoiceId: string; values: PaymentFormValues }) =>
      billingService.addPayment(orgId!, invoiceId, values, userId),
    onSuccess: (_d, vars) => invalidateInvoice(vars.invoiceId),
  })
}
