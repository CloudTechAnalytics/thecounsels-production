import * as React from 'react'
import { Users, UserCheck, CalendarClock, Inbox } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useEmployees, useAllLeaveRequests, useAllHrRequests } from '@/features/hr/hooks/use-hr'
import { HrListsSettings } from '@/features/hr/components/hr-lists-settings'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

function StatTile({ label, value, hint, icon: Icon, loading }: { label: string; value: React.ReactNode; hint?: string; icon: React.ComponentType<{ className?: string }>; loading?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 font-display text-2xl font-semibold">{value}</p>}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

/** HR's own landing page — a quick read on headcount, leave and requests
 * awaiting action. Recruitment/Attendance/Performance stats join this once
 * those modules exist (Phase 2). */
export function HrOverviewPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: employees, isLoading: loadingEmployees } = useEmployees(activeOrgId)
  const canManageLeave = has('leave.manage')
  const canManageRequests = has('hr_requests.manage')
  const { data: leaveRequests } = useAllLeaveRequests(canManageLeave ? activeOrgId : null)
  const { data: hrRequests } = useAllHrRequests(canManageRequests ? activeOrgId : null)

  const active = (employees ?? []).filter((e) => e.profile?.employment_status === 'active' || !e.profile).length
  const onLeave = (employees ?? []).filter((e) => e.profile?.employment_status === 'on_leave').length
  const pendingLeave = (leaveRequests ?? []).filter((r) => r.status === 'pending').length
  const pendingRequests = (hrRequests ?? []).filter((r) => r.status === 'submitted' || r.status === 'in_review').length

  return (
    <div>
      <PageHeader title="HR Overview" description="Headcount, leave and requests at a glance." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Total Employees" value={employees?.length ?? 0} hint="Active + suspended" icon={Users} loading={loadingEmployees} />
        <StatTile label="Active" value={active} icon={UserCheck} loading={loadingEmployees} />
        <StatTile label="On Leave" value={onLeave} icon={CalendarClock} loading={loadingEmployees} />
        <StatTile
          label="Pending Approvals"
          value={canManageLeave || canManageRequests ? pendingLeave + pendingRequests : '—'}
          hint={canManageLeave || canManageRequests ? `${pendingLeave} leave · ${pendingRequests} requests` : 'No approval access'}
          icon={Inbox}
        />
      </div>

      {(has('departments.manage') || has('leave.manage')) && (
        <>
          <h2 className="mb-4 mt-8 font-display text-lg font-semibold">Manage lists</h2>
          <HrListsSettings />
        </>
      )}
    </div>
  )
}
