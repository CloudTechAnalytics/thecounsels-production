import * as React from 'react'
import { Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployees } from '@/features/hr/hooks/use-hr'
import { EMPLOYMENT_STATUS_META, type Employee } from '@/features/hr/types'
import { EmployeeProfileDialog } from '@/features/hr/components/employee-profile-dialog'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { initialsOf } from '@/shared/lib/format'

export function EmployeesPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data, isLoading } = useEmployees(activeOrgId)
  const [search, setSearch] = React.useState('')
  const [editing, setEditing] = React.useState<Employee | null>(null)
  const canManage = has('staff.manage')

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data?.filter((e) => (e.fullName ?? '').toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
  }, [data, search])

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Every person at the firm — department, title, employment status."
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees…" className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filtered && filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Job title</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => {
                const status = e.profile?.employment_status ?? 'active'
                const meta = EMPLOYMENT_STATUS_META[status] ?? EMPLOYMENT_STATUS_META.active
                return (
                  <TableRow
                    key={e.userId}
                    className={canManage ? 'cursor-pointer' : undefined}
                    onClick={() => canManage && setEditing(e)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          {e.avatarUrl && <AvatarImage src={e.avatarUrl} alt="" />}
                          <AvatarFallback>{initialsOf(e.fullName ?? e.email)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{e.fullName ?? '—'}</p>
                          <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.roleName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.departmentName ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.jobTitleName ?? '—'}</TableCell>
                    <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No employees match your search.</p>
        )}
      </Card>

      <EmployeeProfileDialog employee={editing} open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  )
}
