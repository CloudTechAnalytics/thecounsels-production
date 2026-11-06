import { useAuth } from '@/features/auth/context/auth-provider'
import { useDepartments, useJobTitles } from '@/features/hr/hooks/use-hr'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { AdditionalManagers } from '@/features/hr/components/additional-managers'
import { EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_META, EMPLOYMENT_TYPES } from '@/features/hr/types'
import type { EmployeeInput, EmployeeRecord } from '@/features/hr/services/employees.service'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'

const NONE = '__none__'

export interface EmployeeFormValues {
  first_name: string
  last_name: string
  email: string
  phone: string
  date_of_birth: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
  department_id: string
  job_title_id: string
  branch_id: string
  manager_employee_id: string
  reports_to_no_one: boolean
  employment_type: string
  employment_status: string
  start_date: string
  end_date: string
  notes: string
}

export function toFormValues(e?: EmployeeRecord | null): EmployeeFormValues {
  return {
    first_name: e?.first_name ?? '', last_name: e?.last_name ?? '', email: e?.email ?? '', phone: e?.phone ?? '',
    date_of_birth: e?.date_of_birth ?? '', address: e?.address ?? '',
    emergency_contact_name: e?.emergency_contact_name ?? '', emergency_contact_phone: e?.emergency_contact_phone ?? '',
    emergency_contact_relationship: e?.emergency_contact_relationship ?? '',
    department_id: e?.department_id ?? '', job_title_id: e?.job_title_id ?? '', branch_id: e?.branch_id ?? '',
    manager_employee_id: e?.manager_employee_id ?? '', reports_to_no_one: e?.reports_to_no_one ?? false, employment_type: e?.employment_type ?? 'full_time',
    employment_status: e?.employment_status ?? 'active', start_date: e?.start_date ?? '', end_date: e?.end_date ?? '', notes: e?.notes ?? '',
  }
}

/** Form values -> employees row patch; blanks become null. Login users'
 * email comes from their account, so it's never overwritten from here. */
export function toPatch(v: EmployeeFormValues, linked: boolean): EmployeeInput & { first_name: string } {
  const n = (s: string) => (s.trim() ? s.trim() : null)
  return {
    first_name: v.first_name.trim(), last_name: v.last_name.trim(),
    ...(linked ? {} : { email: n(v.email) }),
    phone: n(v.phone), date_of_birth: n(v.date_of_birth), address: n(v.address),
    emergency_contact_name: n(v.emergency_contact_name), emergency_contact_phone: n(v.emergency_contact_phone),
    emergency_contact_relationship: n(v.emergency_contact_relationship),
    department_id: n(v.department_id), job_title_id: n(v.job_title_id), branch_id: n(v.branch_id),
    manager_employee_id: v.reports_to_no_one ? null : n(v.manager_employee_id), reports_to_no_one: v.reports_to_no_one, employment_type: v.employment_type, employment_status: v.employment_status,
    start_date: n(v.start_date), end_date: n(v.end_date), notes: n(v.notes),
  }
}

function Pick({ label, value, onChange, options, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string; disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)} disabled={disabled}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{placeholder}</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export function PersonalFields({ v, set, linked, readOnly }: { v: EmployeeFormValues; set: (patch: Partial<EmployeeFormValues>) => void; linked: boolean; readOnly?: boolean }) {
  const text = (label: string, k: Exclude<keyof EmployeeFormValues, 'reports_to_no_one'>, type = 'text', disabled = false) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={v[k]} onChange={(e) => set({ [k]: e.target.value })} disabled={readOnly || disabled} />
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text('First name', 'first_name')}
        {text('Last name', 'last_name')}
        {text('Email', 'email', 'email', linked)}
        {text('Phone', 'phone', 'tel')}
        {text('Date of birth', 'date_of_birth', 'date')}
      </div>
      {linked && <p className="text-xs text-muted-foreground">Email comes from their login and is changed from their account.</p>}
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Textarea rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} disabled={readOnly} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {text('Emergency contact', 'emergency_contact_name')}
        {text('Their phone', 'emergency_contact_phone', 'tel')}
        {text('Relationship', 'emergency_contact_relationship')}
      </div>
    </div>
  )
}

export function EmploymentFields({ v, set, selfId, readOnly }: { v: EmployeeFormValues; set: (patch: Partial<EmployeeFormValues>) => void; selfId?: string; readOnly?: boolean }) {
  const { activeOrgId } = useAuth()
  const { data: departments } = useDepartments(activeOrgId)
  const { data: titles } = useJobTitles(activeOrgId)
  const { data: branches } = useBranches(activeOrgId)
  const { data: register } = useEmployeeRegister(activeOrgId)
  const managers = (register ?? []).filter((e) => e.id !== selfId && !['resigned', 'terminated', 'former_employee'].includes(e.employment_status))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Pick label="Department" value={v.department_id} onChange={(x) => {
          // New department: suggest its head as line manager if none is chosen yet.
          const head = (departments ?? []).find((d) => d.id === x)?.head_employee_id
          set({ department_id: x, ...(head && head !== selfId && !v.manager_employee_id && !v.reports_to_no_one ? { manager_employee_id: head } : {}) })
        }} placeholder="No department" disabled={readOnly}
          options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
        <Pick label="Job title" value={v.job_title_id} onChange={(x) => set({ job_title_id: x })} placeholder="No job title" disabled={readOnly}
          options={(titles ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <Pick label="Branch / work location" value={v.branch_id} onChange={(x) => set({ branch_id: x })} placeholder="No branch" disabled={readOnly}
          options={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} />
        <div className="space-y-1.5">
          <Pick label="Line manager (reports to)" value={v.reports_to_no_one ? '' : v.manager_employee_id} onChange={(x) => set({ manager_employee_id: x, reports_to_no_one: false })}
            placeholder={v.reports_to_no_one ? 'Reports to no one' : 'Choose a line manager'} disabled={readOnly || v.reports_to_no_one}
            options={managers.map((m) => ({ value: m.id, label: `${m.fullName}${m.hasLogin ? '' : ' (no login)'}` }))} />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={v.reports_to_no_one} disabled={readOnly}
              onChange={(e) => set({ reports_to_no_one: e.target.checked, ...(e.target.checked ? { manager_employee_id: '' } : {}) })} />
            Top of the firm — reports to no one (e.g. Managing Partner)
          </label>
          {!v.reports_to_no_one && <p className="text-xs text-muted-foreground">Approves their leave and endorses their fund requests.</p>}
          {!v.reports_to_no_one && (() => {
            const self = selfId ? (register ?? []).find((e) => e.id === selfId) : undefined
            if (!self) return selfId ? null : <p className="text-xs text-muted-foreground">Works for more than one partner? Add other line managers after saving.</p>
            return <AdditionalManagers employee={self} staff={register ?? []} canEdit={!readOnly} />
          })()}
        </div>
        <Pick label="Employment type" value={v.employment_type} onChange={(x) => set({ employment_type: x || 'full_time' })} placeholder="Full-time" disabled={readOnly}
          options={EMPLOYMENT_TYPES} />
        <Pick label="Employment status" value={v.employment_status} onChange={(x) => set({ employment_status: x || 'active' })} placeholder="Active" disabled={readOnly}
          options={EMPLOYMENT_STATUSES.map((s) => ({ value: s, label: EMPLOYMENT_STATUS_META[s].label }))} />
        <div className="space-y-1.5"><Label>Date of employment</Label><Input type="date" value={v.start_date} onChange={(e) => set({ start_date: e.target.value })} disabled={readOnly} /></div>
        <div className="space-y-1.5"><Label>End date</Label><Input type="date" value={v.end_date} onChange={(e) => set({ end_date: e.target.value })} disabled={readOnly} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>HR notes</Label>
        <Textarea rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} disabled={readOnly} />
      </div>
    </div>
  )
}
