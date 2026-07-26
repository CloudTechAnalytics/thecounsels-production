import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { billingService } from '@/features/billing/services/billing.service'
import type { ExpenseFormValues, GenerateInvoiceFormValues, PaymentFormValues, TimeEntryFormValues } from '@/features/billing/schemas'
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
export function useUnbilledTime(orgId: string | null) {
  return useQuery({ queryKey: ['billing', orgId, 'time'], enabled: Boolean(orgId), queryFn: () => billingService.listUnbilledTime(orgId!) })
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
  return () => qc.invalidateQueries({ queryKey: ['billing', orgId] })
}

export function useAddTimeEntry(orgId: string | null, userId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (v: TimeEntryFormValues) => billingService.addTimeEntry(orgId!, v, userId), onSuccess: invalidate })
}
export function useAddExpense(orgId: string | null, userId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (v: ExpenseFormValues) => billingService.addExpense(orgId!, v, userId), onSuccess: invalidate })
}
export function useDeleteTimeEntry(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (id: string) => billingService.deleteTimeEntry(id), onSuccess: invalidate })
}
export function useDeleteExpense(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (id: string) => billingService.deleteExpense(id), onSuccess: invalidate })
}
export function useGenerateInvoice(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (v: GenerateInvoiceFormValues) => billingService.generateInvoice(orgId!, v), onSuccess: invalidate })
}
export function useSetInvoiceStatus(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: InvoiceStatus }) => billingService.setInvoiceStatus(id, status, orgId!),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['billing', orgId] })
      qc.invalidateQueries({ queryKey: ['invoice', vars.id] })
    },
  })
}
export function useAddPayment(orgId: string | null, userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ invoiceId, values }: { invoiceId: string; values: PaymentFormValues }) =>
      billingService.addPayment(orgId!, invoiceId, values, userId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['billing', orgId] })
      qc.invalidateQueries({ queryKey: ['invoice', vars.invoiceId] })
    },
  })
}
