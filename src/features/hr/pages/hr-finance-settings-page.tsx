import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { useDepartments } from '@/features/hr/hooks/use-hr'
import { useEmployeeRegister, useSetDepartmentHead } from '@/features/hr/hooks/use-employees'
import { HrListsSettings } from '@/features/hr/components/hr-lists-settings'
import { FundRulesCard, DelegationsCard } from '@/features/funds/components/fund-settings'
import { WorkflowSettings } from '@/features/funds/components/workflow-settings'
import { ApprovalRulesCard } from '@/features/hr/components/approval-rules-card'
import { LeaveRulesCard } from '@/features/hr/components/leave-rules-card'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const NONE = '__none__'

function DepartmentHeadsCard() {
  const { activeOrgId } = useAuth()
  const { data: departments = [] } = useDepartments(activeOrgId)
  const { data: employees = [] } = useEmployeeRegister(activeOrgId)
  const setHead = useSetDepartmentHead(activeOrgId)
  const eligible = employees.filter((e) => e.user_id && !['resigned', 'terminated', 'former_employee'].includes(e.employment_status))

  return (
    <Card className="space-y-4 p-6">
      <div>
        <p className="font-display text-base font-semibold">Department heads</p>
        <p className="text-xs text-muted-foreground">Used by the "department head" approval step. Heads need a login to approve.</p>
      </div>
      {departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add departments below first.</p>
      ) : (
        <ul className="divide-y divide-border">
          {departments.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="text-sm font-medium">{d.name}</span>
              <Select
                value={d.head_employee_id ?? NONE}
                onValueChange={async (v) => {
                  try { await setHead.mutateAsync({ departmentId: d.id, employeeId: v === NONE ? null : v }); toast.success(`${d.name} head updated`) }
                  catch (err) { toast.error('Could not update', { description: errorMessage(err) }) }
                }}
              >
                <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No head set</SelectItem>
                  {eligible.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function HrFinanceSettingsPage() {
  const { has } = usePermissions()
  const { activeOrgId } = useAuth()
  const { has: hasFeature } = usePlanFeature(activeOrgId)
  const funds = hasFeature('fund_requests')
  const canFunds = funds && has('funds.manage')
  const canPeople = has('departments.manage') || has('staff.manage')

  return (
    <div>
      <PageHeader title="HR & Finance Settings" description="Who approves what, departments, fund workflows, delegation and payroll configuration." />
      <div className="w-full space-y-8">
        <section className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approvals</p>
          <ApprovalRulesCard />
        </section>
        {canPeople && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People</p>
            <DepartmentHeadsCard />
            {has('departments.manage') && <HrListsSettings />}
            {(has('leave.manage') || has('departments.manage')) && <LeaveRulesCard />}
          </section>
        )}
        {canFunds && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fund requests & approvals</p>
            <WorkflowSettings />
            <FundRulesCard />
          </section>
        )}
        {funds && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delegation</p>
            <DelegationsCard />
          </section>
        )}
        {hasFeature('payroll') && has('payroll.manage') && (
          <section className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payroll</p>
            <Card className="flex flex-wrap items-center justify-between gap-3 p-6">
              <div>
                <p className="font-display text-base font-semibold">Statutory rates & PAYE bands</p>
                <p className="text-xs text-muted-foreground">Pension, NHF, rent relief and tax bands live with the payroll they drive.</p>
              </div>
              <Button asChild variant="outline"><Link to="/hr/payroll?tab=settings">Open payroll settings</Link></Button>
            </Card>
          </section>
        )}
      </div>
    </div>
  )
}
