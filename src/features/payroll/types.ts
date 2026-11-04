import type { BadgeProps } from '@/shared/components/ui/badge'
import type { Database } from '@/shared/types/database.types'
import type { EmployeeRecord } from '@/features/hr/services/employees.service'

export type PayrollSettingsRow = Database['public']['Tables']['payroll_settings']['Row']
export type EmployeeSalary = Database['public']['Tables']['employee_salaries']['Row']
export type PayrollRun = Database['public']['Tables']['payroll_runs']['Row']
export type Payslip = Database['public']['Tables']['payslips']['Row']

export type SalaryPatch = Omit<EmployeeSalary, 'organization_id' | 'employee_id' | 'updated_by' | 'updated_at'>

export interface PayrollEmployee {
  employee: EmployeeRecord
  salary: EmployeeSalary | null
}

export type MyPayslip = Payslip & { period: string; run_status: string; paid_at: string | null }

export const PAYROLL_STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  draft: { label: 'Draft', variant: 'warning' },
  approved: { label: 'Approved', variant: 'default' },
  paid: { label: 'Paid', variant: 'success' },
}

export const EMPTY_SALARY: SalaryPatch = {
  on_payroll: true,
  basic: 0,
  housing: 0,
  transport: 0,
  other_allowances: 0,
  annual_rent: 0,
  pension_enabled: true,
  nhf_enabled: true,
  other_deductions: 0,
  other_deductions_note: null,
  bank_name: null,
  account_number: null,
  account_name: null,
  tax_id: null,
  pension_pin: null,
  pension_administrator: null,
}
