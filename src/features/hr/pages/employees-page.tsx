import * as React from 'react'
import { Search, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { useDepartments } from '@/features/hr/hooks/use-hr'
import { EMPLOYMENT_STATUS_META, EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES } from '@/features/hr/types'
import { EmployeeDetailDialog } from '@/features/hr/components/employee-detail-dialog'
import type { EmployeeRecord } from '@/features/hr/services/employees.service'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ExportButton } from '@/shared/components/export-button'
import { initialsOf } from '@/shared/lib/format'

const ALL = '__all__'
const FORMER = new Set(['resigned', 'terminated', 'former_employee'])

export function EmployeesPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data, isLoading } = useEmployeeRegister(activeOrgId)
  const { data: departments } = useDepartments(activeOrgId)
  const canManage = has('staff.manage')
  const [search, setSearch] = React.useState('')
  const [dept, setDept] = React.useState(ALL)
  const [status, setStatus] = React.useState('current')
  const [login, setLogin] = React.useState(ALL)
  const [selected, setSelected] = React.useState<EmployeeRecord | null>(null)
  const [creating, setCreating] = React.useState(false)

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((e) =>
      (!q || [e.fullName, e.email ?? '', e.employee_number, e.phone ?? ''].some((s) => s.toLowerCase().includes(q)))
      && (dept === ALL || e.department_id === dept)
      && (status === ALL || (status === 'current' ? !FORMER.has(e.employment_status) : e.employment_status === status))
      && (login === ALL || (login === 'yes') === e.hasLogin),
    )
  }, [data, search, dept, status, login])

  const noLogin = (data ?? []).filter((e) => !e.hasLogin && !FORMER.has(e.employment_status)).length

  return (
    <div>
      <PageHeader
        title="Employees"
        description="The firm's employee register — everyone on staff, whether or not they use the app."
        actions={
          <>
            <ExportButton
              filename="employee-register"
              disabled={!filtered.length}
              sheets={() => [{
                name: 'Employees',
                rows: filtered.map((e) => ({
                  'Employee ID': e.employee_number, 'First name': e.first_name, 'Last name': e.last_name, Email: e.email ?? '', Phone: e.phone ?? '',
                  Department: e.departmentName ?? '', 'Job title': e.jobTitleName ?? '', Branch: e.branchName ?? '', Manager: e.managerName ?? '',
                  Type: EMPLOYMENT_TYPES.find((t) => t.value === e.employment_type)?.label ?? e.employment_type,
                  Status: EMPLOYMENT_STATUS_META[e.employment_status]?.label ?? e.employment_status,
                  'Date of employment': e.start_date ?? '', Login: e.hasLogin ? 'Yes' : 'No',
                })),
              }]}
            />
            {canManage && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add employee</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, email or phone…" className="pl-9" />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {(departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current staff</SelectItem>
            <SelectItem value={ALL}>Everyone</SelectItem>
            {EMPLOYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{EMPLOYMENT_STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={login} onValueChange={setLogin}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any access</SelectItem>
            <SelectItem value="yes">Has login</SelectItem>
            <SelectItem value="no">No login</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {noLogin > 0 && (
        <p className="mb-3 text-xs text-muted-foreground">{noLogin} current employee{noLogin === 1 ? '' : 's'} without a login — they can still be paid and have leave recorded.</p>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job title</TableHead>
                <TableHead className="hidden lg:table-cell">Branch</TableHead>
                <TableHead className="hidden lg:table-cell">Manager</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const meta = EMPLOYMENT_STATUS_META[e.employment_status] ?? EMPLOYMENT_STATUS_META.active
                return (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelected(e)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          {e.avatarUrl && <AvatarImage src={e.avatarUrl} alt="" />}
                          <AvatarFallback>{initialsOf(e.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {e.fullName}
                            {!e.hasLogin && <Badge variant="muted" className="ml-2 align-middle">No login</Badge>}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{e.employee_number}{e.email ? ` · ${e.email}` : ''}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.departmentName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.jobTitleName ?? '—'}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{e.branchName ?? '—'}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{e.managerName ?? '—'}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No employees match.</p>
        )}
      </Card>

      <EmployeeDetailDialog
        employee={selected}
        open={creating || Boolean(selected)}
        onOpenChange={(o) => { if (!o) { setSelected(null); setCreating(false) } }}
      />
    </div>
  )
}
