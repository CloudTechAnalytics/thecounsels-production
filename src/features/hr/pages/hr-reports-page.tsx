import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployees, useAllLeaveRequests } from '@/features/hr/hooks/use-hr'
import { EMPLOYMENT_STATUS_META, LEAVE_STATUS_META } from '@/features/hr/types'
import { HrListsSettings } from '@/features/hr/components/hr-lists-settings'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'

function CountList({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  return (
    <Card className="p-5">
      <p className="font-display text-sm font-semibold">{title}</p>
      {entries.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {entries.map(([label, n]) => (
            <li key={label} className="flex items-center justify-between text-sm">
              <span className="capitalize text-muted-foreground">{label.replace(/_/g, ' ')}</span>
              <span className="font-medium">{n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No data yet.</p>
      )}
    </Card>
  )
}

/** Lightweight for now — direct counts over what's already fetched, plus
 * an export of the employee directory (reusing the existing export
 * infrastructure the rest of the app uses, not a new one). Attendance/
 * recruitment/turnover reports arrive with those modules (Phase 2). */
export function HrReportsPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: employees } = useEmployees(activeOrgId)
  const { data: leaveRequests } = useAllLeaveRequests(activeOrgId)

  const byDepartment: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  for (const e of employees ?? []) {
    const dept = e.departmentName ?? 'Unassigned'
    byDepartment[dept] = (byDepartment[dept] ?? 0) + 1
    const status = e.profile?.employment_status ?? 'active'
    byStatus[EMPLOYMENT_STATUS_META[status]?.label ?? status] = (byStatus[EMPLOYMENT_STATUS_META[status]?.label ?? status] ?? 0) + 1
  }
  const byLeaveStatus: Record<string, number> = {}
  for (const r of leaveRequests ?? []) {
    const label = LEAVE_STATUS_META[r.status]?.label ?? r.status
    byLeaveStatus[label] = (byLeaveStatus[label] ?? 0) + 1
  }

  return (
    <div>
      <PageHeader
        title="HR Reports"
        description="Headcount, status and leave, at a glance."
        actions={
          <ExportButton
            filename="employee-directory"
            disabled={!employees?.length}
            sheets={() => [{
              name: 'Employees',
              rows: (employees ?? []).map((e) => ({
                Name: e.fullName ?? '',
                Email: e.email,
                Role: e.roleName ?? '',
                Department: e.departmentName ?? '',
                'Job title': e.jobTitleName ?? '',
                Status: EMPLOYMENT_STATUS_META[e.profile?.employment_status ?? 'active']?.label ?? '',
                'Start date': e.profile?.start_date ?? '',
              })),
            }]}
          />
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <CountList title="Headcount by department" counts={byDepartment} />
        <CountList title="Employees by status" counts={byStatus} />
        <CountList title="Leave requests by status" counts={byLeaveStatus} />
      </div>
      <Card className="mt-4 p-5">
        <p className="font-display text-sm font-semibold">Employee directory</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(employees ?? []).slice(0, 30).map((e) => (
            <Badge key={e.userId} variant="outline">{e.fullName ?? e.email}</Badge>
          ))}
          {employees && employees.length > 30 && <Badge variant="muted">+{employees.length - 30} more</Badge>}
        </div>
      </Card>

      {(has('departments.manage') || has('leave.manage')) && (
        <>
          <h2 className="mb-4 mt-8 font-display text-lg font-semibold">Manage lists</h2>
          <HrListsSettings />
        </>
      )}
    </div>
  )
}
