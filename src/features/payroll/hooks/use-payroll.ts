import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/context/auth-provider'
import { payrollService } from '@/features/payroll/services/payroll.service'
import type { PayrollRates } from '@/features/payroll/lib/payroll-calc'
import type { SalaryPatch } from '@/features/payroll/types'

export function usePayrollRates(organizationId: string | null) {
  return useQuery({
    queryKey: ['payroll', 'rates', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => payrollService.getRates(organizationId!),
  })
}

export function useSavePayrollRates(organizationId: string | null) {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: (rates: PayrollRates) => payrollService.saveRates(organizationId!, rates, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'rates', organizationId] }),
  })
}

export function usePayrollEmployees(organizationId: string | null) {
  return useQuery({
    queryKey: ['payroll', 'employees', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => payrollService.listPayrollEmployees(organizationId!),
  })
}

export function useSaveSalary(organizationId: string | null) {
  const qc = useQueryClient()
  const { userId } = useAuth()
  return useMutation({
    mutationFn: ({ employeeId, patch }: { employeeId: string; patch: SalaryPatch }) =>
      payrollService.saveSalary(organizationId!, employeeId, patch, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll', 'employees', organizationId] }),
  })
}

export function usePayrollRuns(organizationId: string | null) {
  return useQuery({
    queryKey: ['payroll', 'runs', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => payrollService.listRuns(organizationId!),
  })
}

export function usePayslips(runId: string | null) {
  return useQuery({
    queryKey: ['payroll', 'payslips', runId],
    enabled: Boolean(runId),
    queryFn: () => payrollService.listPayslips(runId!),
  })
}

function useInvalidatePayroll(organizationId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['payroll', 'runs', organizationId] })
    qc.invalidateQueries({ queryKey: ['payroll', 'payslips'] })
  }
}

export function useCreatePayrollRun(organizationId: string | null) {
  const invalidate = useInvalidatePayroll(organizationId)
  return useMutation({ mutationFn: (period: string) => payrollService.createRun(organizationId!, period), onSuccess: invalidate })
}

export function useRecalculatePayrollRun(organizationId: string | null) {
  const invalidate = useInvalidatePayroll(organizationId)
  return useMutation({ mutationFn: (runId: string) => payrollService.generatePayslips(organizationId!, runId), onSuccess: invalidate })
}

export function usePayrollRunAction(organizationId: string | null) {
  const invalidate = useInvalidatePayroll(organizationId)
  return useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: 'approve' | 'paid' | 'reopen' | 'delete' }) => {
      if (action === 'approve') return payrollService.approveRun(runId)
      if (action === 'paid') return payrollService.markPaid(runId)
      if (action === 'reopen') return payrollService.reopenRun(runId)
      return payrollService.deleteRun(runId)
    },
    onSuccess: invalidate,
  })
}

export function useEmployeePayslips(employeeId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['payroll', 'employee-payslips', employeeId],
    enabled: Boolean(employeeId) && enabled,
    queryFn: () => payrollService.listEmployeePayslips(employeeId!),
  })
}

export function useMyPayslips(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['payroll', 'my-payslips', organizationId, userId],
    enabled: Boolean(organizationId && userId),
    queryFn: () => payrollService.listMyPayslips(organizationId!, userId!),
  })
}
