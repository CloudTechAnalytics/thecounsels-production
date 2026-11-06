import * as React from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { Paperclip } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useCreateEmployee, useUpdateEmployee, useDeleteEmployee } from '@/features/hr/hooks/use-employees'
import { useAllLeaveRequests, useEmployeeHrDocuments, useLeaveTypes } from '@/features/hr/hooks/use-hr'
import { useFundRequests } from '@/features/funds/hooks/use-funds'
import { useEmployeePayslips } from '@/features/payroll/hooks/use-payroll'
import { hrService } from '@/features/hr/services/hr.service'
import { EmploymentFields, PersonalFields, toFormValues, toPatch, type EmployeeFormValues } from '@/features/hr/components/employee-form'
import { EMPLOYMENT_STATUS_META, LEAVE_STATUS_META, HR_DOCUMENT_CATEGORIES } from '@/features/hr/types'
import { FUND_STATUS_META, fundStatusLabel } from '@/features/funds/types'
import type { EmployeeRecord } from '@/features/hr/services/employees.service'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira, initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Tab = 'personal' | 'employment' | 'funds' | 'leave' | 'payroll' | 'documents'

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

function FundsHistory({ employee }: { employee: EmployeeRecord }) {
  const { activeOrgId } = useAuth()
  const { data = [], isLoading } = useFundRequests(activeOrgId)
  const rows = data.filter((r) => r.user_id === employee.user_id && r.status !== 'draft')
  if (!employee.user_id) return <Empty>Fund requests are made by staff with a login.</Empty>
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (rows.length === 0) return <Empty>No fund requests you can see.</Empty>
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id}>
          <Link to={`/hr/funds/${r.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary">
            <span className="min-w-0"><span className="font-medium">{r.request_number}</span> <span className="text-muted-foreground">{r.title}</span></span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums">{formatNaira(Number(r.approved_amount ?? r.amount))}</span>
              <Badge variant={FUND_STATUS_META[r.status]?.variant}>{fundStatusLabel(r)}</Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function LeaveHistory({ employee }: { employee: EmployeeRecord }) {
  const { activeOrgId } = useAuth()
  const { data = [], isLoading } = useAllLeaveRequests(activeOrgId)
  const { data: types } = useLeaveTypes(activeOrgId)
  const rows = data.filter((r) => r.user_id === employee.user_id)
  if (!employee.user_id) return <Empty>Leave for staff without a login will be recorded by HR in the leave module (Phase 3).</Empty>
  if (isLoading) return <Skeleton className="h-24 w-full" />
  if (rows.length === 0) return <Empty>No leave requests.</Empty>
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <span>{types?.find((t) => t.id === r.leave_type_id)?.name ?? 'Leave'} · {format(new Date(r.start_date), 'MMM d')} – {format(new Date(r.end_date), 'MMM d, yyyy')} <span className="text-muted-foreground">({r.days} days)</span></span>
          <Badge variant={LEAVE_STATUS_META[r.status]?.variant}>{LEAVE_STATUS_META[r.status]?.label ?? r.status}</Badge>
        </li>
      ))}
    </ul>
  )
}

function PayrollHistory({ employee }: { employee: EmployeeRecord }) {
  const { has } = usePermissions()
  const canSee = has('payroll.manage')
  const { data = [], isLoading } = useEmployeePayslips(employee.id, canSee)
  if (!canSee) return <Empty>Payroll details are only visible to payroll managers.</Empty>
  if (isLoading) return <Skeleton className="h-24 w-full" />
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Salary structure and bank details are kept in <Link to="/hr/payroll" className="text-primary hover:underline">Payroll → Salaries</Link>, visible only to payroll managers.</p>
      {data.length === 0 ? <Empty>No payslips yet.</Empty> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 font-medium">Month</th>
              <th className="py-2 text-right font-medium">Gross</th>
              <th className="py-2 text-right font-medium">PAYE</th>
              <th className="py-2 text-right font-medium">Net</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0">
                <td className="py-2">{format(new Date(p.period + 'T00:00:00'), 'MMM yyyy')}</td>
                <td className="py-2 text-right tabular-nums">{formatNaira(Number(p.gross))}</td>
                <td className="py-2 text-right tabular-nums">{formatNaira(Number(p.paye))}</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatNaira(Number(p.net))}</td>
                <td className="py-2 capitalize">{p.run_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Documents({ employee }: { employee: EmployeeRecord }) {
  const { activeOrgId } = useAuth()
  const { data = [], isLoading } = useEmployeeHrDocuments(activeOrgId, employee.user_id)
  if (!employee.user_id) return <Empty>Documents can be stored once this employee is linked to a login. (Register-only document storage is coming in a later phase.)</Empty>
  if (isLoading) return <Skeleton className="h-24 w-full" />
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Upload and manage files from <Link to="/hr/documents" className="text-primary hover:underline">HR Documents</Link>.</p>
      {data.length === 0 ? <Empty>No documents yet.</Empty> : (
        <ul className="space-y-1 text-sm">
          {data.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded bg-muted/40 px-3 py-1.5">
              <button
                className="flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                onClick={async () => {
                  try { window.open(await hrService.getHrDocumentUrl(d.storage_path), '_blank', 'noopener') }
                  catch (err) { toast.error('Could not open document', { description: errorMessage(err) }) }
                }}
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{d.display_name}</span>
              </button>
              <span className="shrink-0 text-xs text-muted-foreground">{HR_DOCUMENT_CATEGORIES.find((c) => c.value === d.category)?.label ?? d.category}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** New employee (employee=null) or an existing one's full profile. */
export function EmployeeDetailDialog({ employee, open, onOpenChange }: { employee: EmployeeRecord | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('staff.manage')
  const create = useCreateEmployee(activeOrgId)
  const update = useUpdateEmployee(activeOrgId)
  const remove = useDeleteEmployee(activeOrgId)
  const [tab, setTab] = React.useState<Tab>('personal')
  const [v, setV] = React.useState<EmployeeFormValues>(toFormValues())
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const set = (patch: Partial<EmployeeFormValues>) => setV((x) => ({ ...x, ...patch }))
  const isNew = !employee

  React.useEffect(() => {
    if (!open) return
    setV(toFormValues(employee))
    setTab('personal')
  }, [open, employee])

  const onSave = async () => {
    if (!v.first_name.trim()) { toast.error('First name is required'); setTab('personal'); return }
    if (canManage && !v.manager_employee_id && !v.reports_to_no_one) {
      toast.error('Choose a line manager', { description: 'Or tick “Top of the firm” for someone who reports to no one.' })
      setTab('employment')
      return
    }
    const patch = toPatch(v, Boolean(employee?.user_id))
    try {
      if (isNew) {
        const rec = await create.mutateAsync(patch)
        toast.success(`${rec.first_name} added as ${rec.employee_number}`, { description: 'They can be paid and tracked without a login. Invite them to the app any time from Firm Settings → Members — use the same email and they link automatically.' })
      } else {
        const { accessChange } = await update.mutateAsync({ employee, patch })
        toast.success('Employee saved', accessChange ? { description: accessChange === 'suspended' ? 'Their workspace access has been suspended.' : 'Their workspace access has been restored.' } : undefined)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save employee', { description: errorMessage(err) })
    }
  }

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'personal', label: 'Personal', show: true },
    { key: 'employment', label: 'Employment', show: true },
    { key: 'funds', label: 'Fund requests', show: !isNew },
    { key: 'leave', label: 'Leave', show: !isNew },
    { key: 'payroll', label: 'Payroll', show: !isNew },
    { key: 'documents', label: 'Documents', show: !isNew },
  ]
  const status = employee ? EMPLOYMENT_STATUS_META[employee.employment_status] ?? EMPLOYMENT_STATUS_META.active : null
  const editableTab = tab === 'personal' || tab === 'employment'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            {employee ? (
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  {employee.avatarUrl && <AvatarImage src={employee.avatarUrl} alt="" />}
                  <AvatarFallback>{initialsOf(employee.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <DialogTitle className="flex flex-wrap items-center gap-2">
                    {employee.fullName}
                    {status && <Badge variant={status.variant}>{status.label}</Badge>}
                    <Badge variant={employee.hasLogin ? 'outline' : 'muted'}>{employee.hasLogin ? 'Has login' : 'No login'}</Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {employee.employee_number}{employee.jobTitleName ? ` · ${employee.jobTitleName}` : ''}{employee.departmentName ? ` · ${employee.departmentName}` : ''}
                    {employee.start_date ? ` · since ${format(new Date(employee.start_date), 'MMM yyyy')}` : ''}
                  </DialogDescription>
                </div>
              </div>
            ) : (
              <>
                <DialogTitle>Add employee</DialogTitle>
                <DialogDescription>Adds them to the register with an employee number. This does not give them access to the app.</DialogDescription>
              </>
            )}
          </DialogHeader>

          <div className="flex w-fit max-w-full flex-wrap rounded-lg border border-border p-0.5">
            {tabs.filter((t) => t.show).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="min-h-[240px]">
            {tab === 'personal' && <PersonalFields v={v} set={set} linked={Boolean(employee?.user_id)} readOnly={!canManage} />}
            {tab === 'employment' && <EmploymentFields v={v} set={set} selfId={employee?.id} readOnly={!canManage} />}
            {employee && tab === 'funds' && <FundsHistory employee={employee} />}
            {employee && tab === 'leave' && <LeaveHistory employee={employee} />}
            {employee && tab === 'payroll' && <PayrollHistory employee={employee} />}
            {employee && tab === 'documents' && <Documents employee={employee} />}
          </div>

          {canManage && editableTab && (
            <DialogFooter className="gap-2 sm:justify-between">
              <div>
                {employee && !employee.user_id && (
                  <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>Remove from register</Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={onSave} loading={create.isPending || update.isPending}>{isNew ? 'Add employee' : 'Save changes'}</Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Remove from the register?"
        description="Only for entries added by mistake. Anyone who has worked here should be set to Resigned or Terminated instead, so their records are kept."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!employee) return
          try { await remove.mutateAsync(employee); toast.success('Removed from the register'); setConfirmDelete(false); onOpenChange(false) }
          catch (err) { toast.error('Could not remove', { description: errorMessage(err) }) }
        }}
      />
    </>
  )
}
