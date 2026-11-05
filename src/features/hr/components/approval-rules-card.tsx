import * as React from 'react'
import { ShieldCheck, Pencil, RotateCcw } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  APPROVAL_AREAS, useApprovalCandidates, useApprovalRules, useResetApprovalRule, useSaveApprovalRule,
  type ApprovalArea, type ApprovalCandidate, type ApprovalRule,
} from '@/features/hr/hooks/use-approval-rules'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const FIRM = '__firm__'

function names(rule: ApprovalRule, candidates: ApprovalCandidate[]): string[] {
  const label = (kind: string, value: string) => candidates.find((c) => c.area === rule.area && c.kind === kind && c.value === value)?.label
  return [
    ...rule.approver_roles.map((r) => `${label('role', r) ?? r} (role)`),
    ...rule.approver_user_ids.map((u) => label('person', u) ?? 'Former member'),
  ]
}

function Chips({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((i) => <Badge key={i} variant={muted ? 'muted' : 'secondary'} className="font-normal">{i}</Badge>)}
    </span>
  )
}

function AreaEditor({ area, rules, candidates, branches, onDone }: {
  area: ApprovalArea
  rules: ApprovalRule[]
  candidates: ApprovalCandidate[]
  branches: { id: string; name: string }[]
  onDone: () => void
}) {
  const { activeOrgId } = useAuth()
  const save = useSaveApprovalRule(activeOrgId)
  const reset = useResetApprovalRule(activeOrgId)
  const [scope, setScope] = React.useState(FIRM)
  const branchId = scope === FIRM ? null : scope
  const existing = rules.find((r) => r.branch_id === branchId)
  const [roles, setRoles] = React.useState<string[]>([])
  const [people, setPeople] = React.useState<string[]>([])
  React.useEffect(() => {
    setRoles(existing?.approver_roles ?? [])
    setPeople(existing?.approver_user_ids ?? [])
  }, [existing])
  const roleOptions = candidates.filter((c) => c.area === area && c.kind === 'role')
  const personOptions = candidates.filter((c) => c.area === area && c.kind === 'person')
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const run = async () => {
    if (roles.length + people.length === 0) { toast.error('Choose at least one role or person — or use “Reset to default”'); return }
    try {
      await save.mutateAsync({ id: existing?.id, area, branchId, roles, userIds: people })
      toast.success('Approvers saved', { description: 'Takes effect immediately and is recorded in the audit log.' })
      onDone()
    } catch (err) { toast.error('Could not save', { description: errorMessage(err) }) }
  }
  const runReset = async () => {
    if (!existing) { onDone(); return }
    try {
      await reset.mutateAsync(existing.id)
      toast.success(branchId ? 'Branch rule removed — the whole-firm rule applies' : 'Back to the default approvers')
      onDone()
    } catch (err) { toast.error('Could not reset', { description: errorMessage(err) }) }
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      {branches.length > 0 && (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label>Applies to</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={FIRM}>Whole firm</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} branch only</SelectItem>)}
            </SelectContent>
          </Select>
          {branchId && <p className="text-xs text-muted-foreground">A branch rule overrides the whole-firm rule for that branch’s staff.</p>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>By role</Label>
          {roleOptions.length === 0 ? <p className="text-xs text-muted-foreground">No role has access to this.</p> : roleOptions.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={roles.includes(o.value)} onChange={() => toggle(roles, setRoles, o.value)} />
              {o.label}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Named people</Label>
          {personOptions.length === 0 ? <p className="text-xs text-muted-foreground">Nobody has access to this yet.</p> : personOptions.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={people.includes(o.value)} onChange={() => toggle(people, setPeople, o.value)} />
              <span>{o.label}{o.detail && <span className="text-muted-foreground"> · {o.detail}</span>}</span>
            </label>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Nobody can approve their own request. If none of these people can act on a request — say it’s their own, or from a branch they can’t see — it goes to the default approvers so nothing gets stuck.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        {existing && <Button size="sm" variant="outline" onClick={runReset} loading={reset.isPending}><RotateCcw className="h-4 w-4" /> {branchId ? 'Remove branch rule' : 'Reset to default'}</Button>}
        <Button size="sm" onClick={run} loading={save.isPending}>Save approvers</Button>
      </div>
    </div>
  )
}

/** "Who approves what" — the firm-wide Managing Partner chooses approvers
 * per area (0189); everyone with settings access can see the current setup. */
export function ApprovalRulesCard() {
  const { activeOrgId, activeMembership } = useAuth()
  const { data: rules = [], isLoading } = useApprovalRules(activeOrgId)
  const { data: candidates = [] } = useApprovalCandidates(activeOrgId)
  const { data: branches = [] } = useBranches(activeOrgId)
  const [editing, setEditing] = React.useState<ApprovalArea | null>(null)
  const canEdit = activeMembership?.role.key === 'managing_partner' && (activeMembership?.access_scope ?? 'organization') === 'organization'
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Branch'

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <p className="font-display text-base font-semibold">Who approves what</p>
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? 'Choose who approves each kind of request. Leave an area on “Default” and anyone whose role has access can approve.'
              : 'Set by the Managing Partner. This is who approves each kind of request in your firm.'}
          </p>
        </div>
      </div>
      {isLoading ? <Skeleton className="h-48 w-full" /> : (
        <ul className="divide-y divide-border">
          {APPROVAL_AREAS.map((a) => {
            const areaRules = rules.filter((r) => r.area === a.area)
            const firmRule = areaRules.find((r) => r.branch_id === null)
            const branchRules = areaRules.filter((r) => r.branch_id !== null)
            const defaults = candidates.filter((c) => c.area === a.area && c.kind === 'role').map((c) => c.label)
            return (
              <li key={a.area} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-semibold">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={cn('font-medium', firmRule ? 'text-primary' : 'text-muted-foreground')}>{firmRule ? 'Whole firm:' : 'Default:'}</span>
                      {firmRule ? <Chips items={names(firmRule, candidates)} /> : <Chips items={defaults.length ? defaults : ['Anyone with access']} muted />}
                    </div>
                    {branchRules.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium text-primary">{branchName(r.branch_id)}:</span>
                        <Chips items={names(r, candidates)} />
                      </div>
                    ))}
                  </div>
                  {canEdit && editing !== a.area && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(a.area)}><Pencil className="h-4 w-4" /> Change</Button>
                  )}
                </div>
                {editing === a.area && (
                  <AreaEditor area={a.area} rules={areaRules} candidates={candidates} branches={branches} onDone={() => setEditing(null)} />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Fund-request approval steps (by amount, category and branch) are set under Fund requests &amp; approvals below.</p>
    </Card>
  )
}
