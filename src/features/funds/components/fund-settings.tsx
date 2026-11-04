import * as React from 'react'
import { format } from 'date-fns'
import { UserCheck } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useFundSettings, useSaveFundSettings, useDelegations, useCreateDelegation, useEndDelegation } from '@/features/funds/hooks/use-funds'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { isApproverRole } from '@/features/funds/types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ToggleSwitch } from '@/shared/components/toggle-switch'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

/** Default chain + retirement deadline — used whenever no workflow matches. */
export function FundRulesCard() {
  const { activeOrgId } = useAuth()
  const { data: settings, isLoading } = useFundSettings(activeOrgId)
  const save = useSaveFundSettings(activeOrgId)
  const [requireManager, setRequireManager] = React.useState(true)
  const [threshold, setThreshold] = React.useState('')
  const [dueDays, setDueDays] = React.useState('14')
  const [dueBasis, setDueBasis] = React.useState('disbursement')

  React.useEffect(() => {
    if (!settings) return
    setDueBasis(settings.retirement_due_basis)
    setRequireManager(settings.require_line_manager)
    setThreshold(settings.leadership_threshold != null ? String(settings.leadership_threshold) : '')
    setDueDays(String(settings.retirement_due_days))
  }, [settings])

  const onSave = async () => {
    const days = Number(dueDays)
    const limit = threshold.trim() === '' ? null : Number(threshold)
    if (!Number.isInteger(days) || days < 1 || days > 365) { toast.error('Retirement deadline must be 1–365 days'); return }
    if (limit != null && !(limit > 0)) { toast.error('Partner approval amount must be greater than zero, or left blank'); return }
    try {
      await save.mutateAsync({ require_line_manager: requireManager, leadership_threshold: limit, retirement_due_days: days, retirement_due_basis: dueBasis })
      toast.success('Fund settings saved')
    } catch (err) {
      toast.error('Could not save settings', { description: errorMessage(err) })
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  return (
    <Card className="space-y-5 p-6">
      <div>
        <p className="font-display text-base font-semibold">Default fund request rules</p>
        <p className="text-xs text-muted-foreground">Used for any request no approval workflow matches.</p>
      </div>
      <ToggleSwitch
        checked={requireManager} onChange={setRequireManager} icon={UserCheck}
        label="Line manager approves first"
        hint="Requests go to the requester's manager first — only if that manager is an approver (Managing Partner, Partner, Finance or HR manager). Otherwise this step is skipped."
      />
      <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">Nobody can approve, pay out or review their own request. This can't be switched off.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Partner approval for amounts of (₦)</Label>
          <Input type="number" min={0} placeholder="Leave blank to never require it" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Retirement deadline (days)</Label>
          <Input type="number" min={1} max={365} value={dueDays} onChange={(e) => setDueDays(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Counted from</Label>
          <Select value={dueBasis} onValueChange={setDueBasis}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="disbursement">The payout date</SelectItem>
              <SelectItem value="needed_by">The date funds were needed (end of assignment)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Finance can also set a custom deadline on any individual advance. Overdue advances trigger a daily reminder to the employee, finance and their line manager.</p>
      <div className="flex justify-end">
        <Button onClick={onSave} loading={save.isPending}>Save rules</Button>
      </div>
    </Card>
  )
}

/** Out-of-office: hand your approval authority to a colleague for a date range. */
export function DelegationsCard() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('funds.manage')
  const { data: delegations = [], isLoading } = useDelegations(activeOrgId)
  const { data: employees } = useEmployeeRegister(activeOrgId)
  const create = useCreateDelegation(activeOrgId)
  const end = useEndDelegation(activeOrgId)
  const people = (employees ?? []).filter((e) => e.user_id && e.membershipStatus === 'active' && isApproverRole(e.roleKey))
  const nameOf = (id: string) => (employees ?? []).find((p) => p.user_id === id)?.fullName ?? 'Someone'
  const isApprover = has('funds.approve')
  const todayIso = new Date().toISOString().slice(0, 10)

  const [delegator, setDelegator] = React.useState(userId ?? '')
  const [delegate, setDelegate] = React.useState('')
  const [startsOn, setStartsOn] = React.useState(todayIso)
  const [endsOn, setEndsOn] = React.useState('')
  const [reason, setReason] = React.useState('')
  React.useEffect(() => { if (userId && !delegator) setDelegator(userId) }, [userId, delegator])

  const onCreate = async () => {
    if (!delegate || !endsOn) { toast.error('Choose who covers for you and until when'); return }
    if (delegate === delegator) { toast.error('Choose someone else'); return }
    if (endsOn < startsOn) { toast.error('End date must be on or after the start date'); return }
    try {
      await create.mutateAsync({ delegator, delegate, startsOn, endsOn, reason: reason.trim() })
      toast.success(`${nameOf(delegate)} can approve on ${delegator === userId ? 'your' : `${nameOf(delegator)}'s`} behalf`)
      setDelegate(''); setEndsOn(''); setReason('')
    } catch (err) {
      toast.error('Could not set up delegation', { description: errorMessage(err) })
    }
  }

  const live = delegations.filter((d) => d.is_active && d.ends_on >= todayIso)
  if (!isApprover && !canManage) return null

  return (
    <Card className="space-y-4 p-6">
      <div>
        <p className="font-display text-base font-semibold">Approval delegation</p>
        <p className="text-xs text-muted-foreground">Away? Let another approver cover your fund approvals for a set period. Only approvers (Managing Partner, Partner, Finance, HR manager) can delegate or be delegated to, and nobody can approve their own request through a delegation.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {canManage && (
          <div className="space-y-1.5">
            <Label>Approver</Label>
            <Select value={delegator} onValueChange={setDelegator}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.user_id!}>{p.user_id === userId ? `${p.fullName} (you)` : p.fullName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Covered by</Label>
          <Select value={delegate} onValueChange={setDelegate}>
            <SelectTrigger><SelectValue placeholder="Choose a colleague" /></SelectTrigger>
            <SelectContent>{people.filter((p) => p.user_id !== delegator).map((p) => <SelectItem key={p.id} value={p.user_id!}>{p.fullName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>From</Label><Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Until</Label><Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Reason</Label><Input placeholder="Optional" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <div className="flex justify-end"><Button size="sm" onClick={onCreate} loading={create.isPending}>Set up delegation</Button></div>

      {isLoading ? null : live.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {live.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                <span className="font-medium">{nameOf(d.delegate_user_id)}</span> covers for <span className="font-medium">{nameOf(d.delegator_user_id)}</span>
                <span className="text-muted-foreground"> · {format(new Date(d.starts_on), 'MMM d')} – {format(new Date(d.ends_on), 'MMM d, yyyy')}{d.reason ? ` · ${d.reason}` : ''}</span>
              </span>
              <span className="flex items-center gap-2">
                {d.starts_on <= todayIso ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Scheduled</Badge>}
                {(d.delegator_user_id === userId || canManage) && (
                  <Button variant="ghost" size="sm" onClick={() => end.mutate(d.id, { onSuccess: () => toast.success('Delegation ended'), onError: (e) => toast.error('Could not end delegation', { description: errorMessage(e) }) })}>
                    End
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
