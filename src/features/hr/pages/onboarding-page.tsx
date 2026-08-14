import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ClipboardCheck } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useEmployees, useOnboardingTemplates, useAssignOnboarding, useAllOnboarding } from '@/features/hr/hooks/use-hr'
import { OnboardingTemplateDialog } from '@/features/hr/components/onboarding-template-dialog'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

function AssignCard() {
  const { activeOrgId } = useAuth()
  const { data: employees } = useEmployees(activeOrgId)
  const { data: templates } = useOnboardingTemplates(activeOrgId)
  const assign = useAssignOnboarding(activeOrgId)
  const [employeeId, setEmployeeId] = React.useState('')
  const [templateId, setTemplateId] = React.useState('')

  const submit = async () => {
    if (!employeeId || !templateId) {
      toast.error('Choose an employee and a checklist')
      return
    }
    try {
      await assign.mutateAsync({ userId: employeeId, templateId })
      toast.success('Onboarding assigned', { description: 'Each item is now a real task in their Tasks list.' })
      setEmployeeId(''); setTemplateId('')
    } catch (err) {
      toast.error('Could not assign', { description: errorMessage(err) })
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-semibold">Assign a checklist</p>
        <OnboardingTemplateDialog />
      </div>
      {templates?.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No checklists yet — create one to get started.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Employee</p>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Choose an employee" /></SelectTrigger>
              <SelectContent>
                {employees?.map((e) => <SelectItem key={e.userId} value={e.userId}>{e.fullName ?? e.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48 flex-1 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Checklist</p>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Choose a checklist" /></SelectTrigger>
              <SelectContent>
                {templates?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button loading={assign.isPending} onClick={submit}>Assign</Button>
        </div>
      )}
    </Card>
  )
}

/** The real, findable home for onboarding — previously this only lived
 * buried inside one employee's profile dialog at a time, with no way to
 * see everyone's progress in one place. */
export function OnboardingPage() {
  const { activeOrgId } = useAuth()
  const { data: assignments, isLoading } = useAllOnboarding(activeOrgId)

  return (
    <div>
      <PageHeader title="Onboarding" description="Assign checklists to new hires and track their progress." />
      <div className="space-y-6">
        <AssignCard />

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4">
            <p className="font-display text-base font-semibold">In progress</p>
          </div>
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : assignments && assignments.length > 0 ? (
            <ul className="divide-y divide-border">
              {assignments.map((a) => {
                const complete = a.total > 0 && a.done === a.total
                return (
                  <li key={a.onboarding.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.employeeName} — {a.templateName}</p>
                      <p className="text-xs text-muted-foreground">
                        Assigned {formatDistanceToNow(new Date(a.onboarding.assigned_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge variant={complete ? 'success' : 'warning'}>{a.done}/{a.total} completed</Badge>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <ClipboardCheck className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No onboarding assigned yet.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
