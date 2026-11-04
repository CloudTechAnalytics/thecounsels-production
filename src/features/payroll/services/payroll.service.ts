import { supabase } from '@/shared/lib/supabase'
import { employeesService } from '@/features/hr/services/employees.service'
import {
  computePayslip, parseTaxBands, DEFAULT_PAYROLL_RATES, type PayrollRates,
} from '@/features/payroll/lib/payroll-calc'
import type {
  EmployeeSalary, MyPayslip, PayrollEmployee, PayrollRun, Payslip, SalaryPatch,
} from '@/features/payroll/types'
import type { Json } from '@/shared/types/database.types'

export const payrollService = {
  async getRates(organizationId: string): Promise<PayrollRates> {
    const { data, error } = await supabase.from('payroll_settings').select('*').eq('organization_id', organizationId).maybeSingle()
    if (error) throw error
    if (!data) return DEFAULT_PAYROLL_RATES
    return {
      pension_employee_rate: Number(data.pension_employee_rate),
      pension_employer_rate: Number(data.pension_employer_rate),
      nhf_rate: Number(data.nhf_rate),
      rent_relief_rate: Number(data.rent_relief_rate),
      rent_relief_cap: Number(data.rent_relief_cap),
      minimum_wage_monthly: Number(data.minimum_wage_monthly),
      tax_bands: parseTaxBands(data.tax_bands),
    }
  },
  async saveRates(organizationId: string, rates: PayrollRates, userId: string | null): Promise<void> {
    const { error } = await supabase.from('payroll_settings').upsert({
      organization_id: organizationId,
      ...rates,
      tax_bands: rates.tax_bands as unknown as Json,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  },

  /** Every active employee alongside their salary record (null if HR hasn't set one yet). */
  async listPayrollEmployees(organizationId: string): Promise<PayrollEmployee[]> {
    const [employees, { data: salaries, error }] = await Promise.all([
      employeesService.listRegister(organizationId),
      supabase.from('employee_salaries').select('*').eq('organization_id', organizationId),
    ])
    if (error) throw error
    const byEmployee = new Map((salaries ?? []).map((s) => [s.employee_id, s as EmployeeSalary]))
    return employees
      .filter((e) => !['resigned', 'terminated', 'former_employee', 'applicant'].includes(e.employment_status))
      .map((employee) => ({ employee, salary: byEmployee.get(employee.id) ?? null }))
      .sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName))
  },
  async saveSalary(organizationId: string, employeeId: string, patch: SalaryPatch, updatedBy: string | null): Promise<void> {
    const { error } = await supabase.from('employee_salaries').upsert({
      organization_id: organizationId,
      employee_id: employeeId,
      ...patch,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
  },

  async listRuns(organizationId: string): Promise<PayrollRun[]> {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('period', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  async listPayslips(runId: string): Promise<Payslip[]> {
    const { data, error } = await supabase.from('payslips').select('*').eq('run_id', runId).order('employee_name')
    if (error) throw error
    return data ?? []
  },

  /** (Re)builds a draft run's payslips from today's salary records and rates. */
  async generatePayslips(organizationId: string, runId: string): Promise<number> {
    const [rates, people] = await Promise.all([this.getRates(organizationId), this.listPayrollEmployees(organizationId)])
    const rows = people
      .filter((p) => p.salary?.on_payroll)
      .map(({ employee, salary }) => {
        const s = salary!
        const calc = computePayslip({
          basic: Number(s.basic),
          housing: Number(s.housing),
          transport: Number(s.transport),
          other_allowances: Number(s.other_allowances),
          annual_rent: Number(s.annual_rent),
          pension_enabled: s.pension_enabled,
          nhf_enabled: s.nhf_enabled,
          other_deductions: Number(s.other_deductions),
        }, rates)
        return {
          organization_id: organizationId,
          run_id: runId,
          user_id: employee.user_id,
          employee_id: employee.id,
          employee_number: employee.employee_number,
          employee_name: employee.fullName,
          job_title: employee.jobTitleName,
          department: employee.departmentName,
          bank_name: s.bank_name,
          account_number: s.account_number,
          account_name: s.account_name,
          tax_id: s.tax_id,
          pension_pin: s.pension_pin,
          basic: Number(s.basic),
          housing: Number(s.housing),
          transport: Number(s.transport),
          other_allowances: Number(s.other_allowances),
          gross: calc.gross,
          pension_employee: calc.pension_employee,
          pension_employer: calc.pension_employer,
          nhf: calc.nhf,
          paye: calc.paye,
          other_deductions: calc.other_deductions,
          other_deductions_note: s.other_deductions_note,
          net: calc.net,
          tax_detail: calc.tax_detail as unknown as Json,
        }
      })
      .filter((r) => r.gross > 0)

    const { error: delErr } = await supabase.from('payslips').delete().eq('run_id', runId)
    if (delErr) throw delErr
    if (rows.length > 0) {
      const { error } = await supabase.from('payslips').insert(rows)
      if (error) throw error
    }
    return rows.length
  },
  async createRun(organizationId: string, period: string): Promise<{ run: PayrollRun; count: number }> {
    const { data: run, error } = await supabase
      .from('payroll_runs')
      .insert({ organization_id: organizationId, period })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') throw new Error('There is already a payroll for that month.')
      throw error
    }
    const count = await this.generatePayslips(organizationId, run.id)
    return { run, count }
  },
  async deleteRun(runId: string): Promise<void> {
    const { error } = await supabase.from('payroll_runs').delete().eq('id', runId)
    if (error) throw error
  },
  async approveRun(runId: string): Promise<void> {
    const { error } = await supabase.rpc('approve_payroll_run', { p_run: runId })
    if (error) throw error
  },
  async markPaid(runId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_payroll_paid', { p_run: runId })
    if (error) throw error
  },
  async reopenRun(runId: string): Promise<void> {
    const { error } = await supabase.rpc('reopen_payroll_run', { p_run: runId })
    if (error) throw error
  },

  /** One employee's payslip history — payroll managers only (RLS). */
  async listEmployeePayslips(employeeId: string): Promise<MyPayslip[]> {
    const { data, error } = await supabase
      .from('payslips')
      .select('*, run:payroll_runs(period, status, paid_at)')
      .eq('employee_id', employeeId)
    if (error) throw error
    return ((data ?? []) as unknown as Array<Payslip & { run: { period: string; status: string; paid_at: string | null } | null }>)
      .filter((p) => p.run)
      .map(({ run, ...p }) => ({ ...p, period: run!.period, run_status: run!.status, paid_at: run!.paid_at }))
      .sort((a, b) => b.period.localeCompare(a.period))
  },

  /** The caller's own released payslips (RLS hides drafts). */
  async listMyPayslips(organizationId: string, userId: string): Promise<MyPayslip[]> {
    const { data, error } = await supabase
      .from('payslips')
      .select('*, run:payroll_runs(period, status, paid_at)')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
    if (error) throw error
    return ((data ?? []) as unknown as Array<Payslip & { run: { period: string; status: string; paid_at: string | null } | null }>)
      .filter((p) => p.run)
      .map(({ run, ...p }) => ({ ...p, period: run!.period, run_status: run!.status, paid_at: run!.paid_at }))
      .sort((a, b) => b.period.localeCompare(a.period))
  },
}
