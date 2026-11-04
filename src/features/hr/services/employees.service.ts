import { supabase } from '@/shared/lib/supabase'
import { administrationService } from '@/features/administration/services/administration.service'
import type { Database } from '@/shared/types/database.types'

export type EmployeeRow = Database['public']['Tables']['employees']['Row']
export type EmployeeInput = Database['public']['Tables']['employees']['Update']

/** A register entry with its lookups resolved — the one shape every HR &
 * Finance screen uses for "an employee", login or not. */
export interface EmployeeRecord extends EmployeeRow {
  fullName: string
  departmentName: string | null
  jobTitleName: string | null
  branchName: string | null
  managerName: string | null
  managerUserId: string | null
  hasLogin: boolean
  roleName: string | null
  membershipStatus: string | null
  avatarUrl: string | null
}

// Same rule hr.service.ts applies to staff_profiles: these statuses end
// workspace access for a linked login, these restore it.
const NO_ACCESS = new Set(['suspended', 'terminated', 'resigned', 'former_employee'])
const REGAINS_ACCESS = new Set(['active', 'onboarding', 'applicant'])

export const fullNameOf = (e: Pick<EmployeeRow, 'first_name' | 'last_name'>) => [e.first_name, e.last_name].filter(Boolean).join(' ').trim()

export const employeesService = {
  async listRegister(organizationId: string): Promise<EmployeeRecord[]> {
    const [{ data: rows, error }, members, { data: departments }, { data: titles }, { data: branches }] = await Promise.all([
      supabase.from('employees').select('*').eq('organization_id', organizationId).order('employee_number'),
      administrationService.listMembers(organizationId).catch(() => []),
      supabase.from('departments').select('id, name').eq('organization_id', organizationId),
      supabase.from('job_titles').select('id, name').eq('organization_id', organizationId),
      supabase.from('branches').select('id, name').eq('organization_id', organizationId),
    ])
    if (error) throw error
    const list = rows ?? []
    const byId = new Map(list.map((e) => [e.id, e]))
    const memberByUser = new Map(members.map((m) => [m.user_id, m]))
    const dept = new Map((departments ?? []).map((d) => [d.id, d.name]))
    const title = new Map((titles ?? []).map((t) => [t.id, t.name]))
    const branch = new Map((branches ?? []).map((b) => [b.id, b.name]))
    return list.map((e) => {
      const m = e.user_id ? memberByUser.get(e.user_id) : undefined
      const mgr = e.manager_employee_id ? byId.get(e.manager_employee_id) : undefined
      return {
        ...e,
        fullName: fullNameOf(e) || e.email || e.employee_number,
        departmentName: e.department_id ? dept.get(e.department_id) ?? null : null,
        jobTitleName: e.job_title_id ? title.get(e.job_title_id) ?? null : null,
        branchName: e.branch_id ? branch.get(e.branch_id) ?? null : null,
        managerName: mgr ? fullNameOf(mgr) : null,
        managerUserId: mgr?.user_id ?? null,
        hasLogin: Boolean(e.user_id),
        roleName: m?.role?.name ?? null,
        membershipStatus: m?.status ?? null,
        avatarUrl: e.photo_url ?? m?.profile?.avatar_url ?? null,
      }
    })
  },

  async createEmployee(organizationId: string, input: EmployeeInput & { first_name: string }): Promise<EmployeeRow> {
    const { data, error } = await supabase
      .from('employees')
      .insert({ ...input, organization_id: organizationId, employee_number: '' })
      .select('*')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId, p_action: 'employee.created', p_entity_type: 'employee', p_entity_id: data.id,
      p_summary: `Added ${fullNameOf(data)} (${data.employee_number}) to the employee register`,
    })
    return data
  },

  /** Saves the register entry; for a linked login, an employment-status
   * change also suspends or restores their workspace access (never the
   * firm owner's). */
  async updateEmployee(organizationId: string, employee: EmployeeRecord, patch: EmployeeInput): Promise<{ accessChange: 'suspended' | 'active' | null }> {
    const { error } = await supabase.from('employees').update(patch).eq('id', employee.id)
    if (error) throw error

    let accessChange: 'suspended' | 'active' | null = null
    if (employee.user_id && patch.employment_status && patch.employment_status !== employee.employment_status) {
      const desired = NO_ACCESS.has(patch.employment_status) ? 'suspended' : REGAINS_ACCESS.has(patch.employment_status) ? 'active' : null
      if (desired) {
        const { data: membership } = await supabase
          .from('memberships').select('id, status, is_owner')
          .eq('organization_id', organizationId).eq('user_id', employee.user_id).maybeSingle()
        if (membership && !membership.is_owner && membership.status !== desired) {
          const { error: memErr } = await supabase.from('memberships').update({ status: desired }).eq('id', membership.id)
          if (memErr) throw memErr
          accessChange = desired
          await supabase.rpc('log_audit', {
            p_org: organizationId,
            p_action: desired === 'suspended' ? 'member.suspended' : 'member.reactivated',
            p_entity_type: 'membership', p_entity_id: membership.id,
            p_summary: `${desired === 'suspended' ? 'Suspended' : 'Reactivated'} workspace access (employment status set to ${patch.employment_status})`,
          })
        }
      }
    }
    await supabase.rpc('log_audit', {
      p_org: organizationId, p_action: 'employee.updated', p_entity_type: 'employee', p_entity_id: employee.id,
      p_summary: `Updated ${employee.fullName} (${employee.employee_number})`,
    })
    return { accessChange }
  },

  async deleteEmployee(organizationId: string, employee: EmployeeRecord): Promise<void> {
    const { error } = await supabase.from('employees').delete().eq('id', employee.id)
    if (error) {
      if (error.code === '23503') throw new Error('This employee has payroll or request history — set their status to Resigned or Terminated instead.')
      throw error
    }
    await supabase.rpc('log_audit', {
      p_org: organizationId, p_action: 'employee.deleted', p_entity_type: 'employee', p_entity_id: employee.id,
      p_summary: `Removed ${employee.fullName} (${employee.employee_number}) from the employee register`,
    })
  },

  async setDepartmentHead(departmentId: string, employeeId: string | null): Promise<void> {
    const { error } = await supabase.from('departments').update({ head_employee_id: employeeId }).eq('id', departmentId)
    if (error) throw error
  },
}
