import * as React from 'react'
import { Plus, Trash2, ArrowDown, Pencil } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useApprovalWorkflows, useSaveWorkflow, useDeleteWorkflow } from '@/features/funds/hooks/use-funds'
import { useDepartments } from '@/features/hr/hooks/use-hr'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { APPROVER_TYPES, FUND_CATEGORIES, fundCategoryLabel, type WorkflowWithSteps } from '@/features/funds/types'
import { ROLE_META } from '@/shared/lib/permissions'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const FIRM_ROLES = Object.entries(ROLE_META).filter(([, m]) => m.group !== 'Platform').sort((a, b) => a[1].rank - b[1].rank)

interface StepDraft {
  step_order: number
  name: string
  approver_type: string
  approver_value: string | null
  approver_user_id: string | null
}

const blankStep = (order: number): StepDraft => ({ step_order: order, name: '', approver_type: 'line_manager', approver_value: null, approver_user_id: null })

function MultiChips({ options, value, onChange, empty }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; empty: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.length === 0 && <span className="text-xs text-muted-foreground">{empty}</span>}
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <button
            key={o.value} type="button"
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function WorkflowDialog({ workflow, open, onOpenChange }: { workflow: WorkflowWithSteps | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const { data: departments } = useDepartments(activeOrgId)
  const { data: branches } = useBranches(activeOrgId)
  const { data: employees } = useEmployeeRegister(activeOrgId)
  const save = useSaveWorkflow(activeOrgId)
  const people = (employees ?? []).filter((e) => e.user_id && e.membershipStatus === 'active')

  const [name, setName] = React.useState('')
  const [priority, setPriority] = React.useState('100')
  const [active, setActive] = React.useState(true)
  const [minAmount, setMinAmount] = React.useState('')
  const [maxAmount, setMaxAmount] = React.useState('')
  const [categories, setCategories] = React.useState<string[]>([])
  const [deptIds, setDeptIds] = React.useState<string[]>([])
  const [branchIds, setBranchIds] = React.useState<string[]>([])
  const [allowSelf, setAllowSelf] = React.useState(false)
  const [steps, setSteps] = React.useState<StepDraft[]>([blankStep(1)])

  React.useEffect(() => {
    if (!open) return
    setName(workflow?.name ?? '')
    setPriority(String(workflow?.priority ?? 100))
    setActive(workflow?.is_active ?? true)
    setMinAmount(workflow?.min_amount != null ? String(workflow.min_amount) : '')
    setMaxAmount(workflow?.max_amount != null ? String(workflow.max_amount) : '')
    setCategories(workflow?.categories ?? [])
    setDeptIds(workflow?.department_ids ?? [])
    setBranchIds(workflow?.branch_ids ?? [])
    setAllowSelf(workflow?.allow_self_approval ?? false)
    setSteps(workflow?.steps.length ? workflow.steps.map((s) => ({ step_order: s.step_order, name: s.name, approver_type: s.approver_type, approver_value: s.approver_value, approver_user_id: s.approver_user_id })) : [blankStep(1)])
  }, [open, workflow])

  const setStep = (i: number, patch: Partial<StepDraft>) => setSteps((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  const onSave = async () => {
    const min = minAmount.trim() === '' ? null : Number(minAmount)
    const max = maxAmount.trim() === '' ? null : Number(maxAmount)
    if (!name.trim()) { toast.error('Name the workflow'); return }
    if ((min != null && !(min >= 0)) || (max != null && !(max >= 0)) || (min != null && max != null && max < min)) { toast.error('Check the amount range'); return }
    for (const [i, s] of steps.entries()) {
      if (!s.name.trim()) { toast.error(`Name step ${i + 1}`); return }
      if (s.approver_type === 'role' && !s.approver_value) { toast.error(`Choose the role(s) for "${s.name}"`); return }
      if (s.approver_type === 'specific_user' && !s.approver_user_id) { toast.error(`Choose the person for "${s.name}"`); return }
    }
    try {
      await save.mutateAsync({
        wf: {
          id: workflow?.id, name: name.trim(), priority: Number(priority) || 100, is_active: active,
          min_amount: min, max_amount: max, categories, department_ids: deptIds, branch_ids: branchIds, allow_self_approval: allowSelf,
        },
        steps: steps.map((s) => ({
          step_order: s.step_order, name: s.name.trim(), approver_type: s.approver_type,
          approver_value: s.approver_type === 'permission' ? 'funds.approve' : s.approver_type === 'role' ? s.approver_value : null,
          approver_user_id: s.approver_type === 'specific_user' ? s.approver_user_id : null,
        })),
      })
      toast.success('Workflow saved', { description: 'New requests that match it follow these steps.' })
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save workflow', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{workflow ? 'Edit approval workflow' : 'New approval workflow'}</DialogTitle>
          <DialogDescription>The first active workflow (lowest priority number) whose conditions match a request decides who approves it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="space-y-1.5"><Label>Name</Label><Input placeholder="e.g. ₦50,000 – ₦200,000" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" min={1} value={priority} onChange={(e) => setPriority(e.target.value)} /></div>
          </div>

          <section className="space-y-3">
            <p className="font-display text-sm font-semibold">When it applies</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>From amount (₦)</Label><Input type="number" min={0} placeholder="Any" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Up to amount (₦)</Label><Input type="number" min={0} placeholder="No limit" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Categories <span className="font-normal text-muted-foreground">(none selected = all)</span></Label>
              <MultiChips options={FUND_CATEGORIES} value={categories} onChange={setCategories} empty="" />
            </div>
            <div className="space-y-1.5"><Label>Departments <span className="font-normal text-muted-foreground">(none = all)</span></Label>
              <MultiChips options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} value={deptIds} onChange={setDeptIds} empty="No departments set up yet." />
            </div>
            <div className="space-y-1.5"><Label>Branches <span className="font-normal text-muted-foreground">(none = all)</span></Label>
              <MultiChips options={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} value={branchIds} onChange={setBranchIds} empty="No branches set up." />
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <p className="font-display text-sm font-semibold">Approval steps</p>
              <p className="text-xs text-muted-foreground">Steps run in order. Give two steps the same number to run them in parallel — both must approve before moving on.</p>
            </div>
            {steps.map((s, i) => (
              <div key={i}>
                {i > 0 && <ArrowDown className="mx-auto mb-2 h-4 w-4 text-muted-foreground" />}
                <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[70px_1fr_1fr_1fr_36px]">
                  <div className="space-y-1"><Label className="text-xs">Step</Label><Input type="number" min={1} value={s.step_order} onChange={(e) => setStep(i, { step_order: Math.max(1, Number(e.target.value) || 1) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Name</Label><Input placeholder="e.g. Finance Manager" value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Approved by</Label>
                    <Select value={s.approver_type} onValueChange={(v) => setStep(i, { approver_type: v, approver_value: null, approver_user_id: null })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{APPROVER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{s.approver_type === 'role' ? 'Role' : s.approver_type === 'specific_user' ? 'Person' : ' '}</Label>
                    {s.approver_type === 'role' ? (
                      <Select value={s.approver_value ?? ''} onValueChange={(v) => setStep(i, { approver_value: v })}>
                        <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="managing_partner,partner">Managing Partner or Partner</SelectItem>
                          {FIRM_ROLES.map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : s.approver_type === 'specific_user' ? (
                      <Select value={s.approver_user_id ?? ''} onValueChange={(v) => setStep(i, { approver_user_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
                        <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.user_id!}>{p.fullName}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <p className="pt-2 text-xs text-muted-foreground">
                        {s.approver_type === 'permission' ? 'Finance, partners — anyone with fund approval rights' : 'Worked out per request'}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="mt-5 h-8 w-8" aria-label="Remove step" disabled={steps.length === 1} onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSteps((all) => [...all, blankStep(Math.max(...all.map((s) => s.step_order)) + 1)])}>
              <Plus className="h-4 w-4" /> Add step
            </Button>
          </section>

          <section className="space-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={allowSelf} onChange={(e) => setAllowSelf(e.target.checked)} />
              <span>Allow an approver to approve their own request on this workflow <span className="block text-xs text-muted-foreground">Off by default. Turn on only where nobody else can approve (e.g. the Managing Partner's own requests).</span></span>
            </label>
          </section>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} loading={save.isPending}>Save workflow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function describeStep(s: WorkflowWithSteps['steps'][number], nameOf: (userId: string) => string) {
  if (s.approver_type === 'role') return s.approver_value === 'managing_partner,partner' ? 'Managing Partner or Partner' : (s.approver_value ?? '').split(',').map((k) => ROLE_META[k as keyof typeof ROLE_META]?.label ?? k).join(' or ')
  if (s.approver_type === 'specific_user') return s.approver_user_id ? nameOf(s.approver_user_id) : '—'
  return APPROVER_TYPES.find((t) => t.value === s.approver_type)?.label ?? s.approver_type
}

export function WorkflowSettings() {
  const { activeOrgId } = useAuth()
  const { data: workflows = [], isLoading } = useApprovalWorkflows(activeOrgId)
  const { data: employees } = useEmployeeRegister(activeOrgId)
  const { data: departments } = useDepartments(activeOrgId)
  const remove = useDeleteWorkflow(activeOrgId)
  const [editing, setEditing] = React.useState<WorkflowWithSteps | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [deleting, setDeleting] = React.useState<WorkflowWithSteps | null>(null)
  const nameOf = (userId: string) => employees?.find((e) => e.user_id === userId)?.fullName ?? 'Someone'
  const range = (w: WorkflowWithSteps) =>
    w.min_amount == null && w.max_amount == null ? 'Any amount'
      : w.max_amount == null ? `${formatNaira(Number(w.min_amount))} and above`
      : w.min_amount == null ? `Up to ${formatNaira(Number(w.max_amount))}`
      : `${formatNaira(Number(w.min_amount))} – ${formatNaira(Number(w.max_amount))}`

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-semibold">Approval workflows</p>
          <p className="text-xs text-muted-foreground">
            Who approves which fund requests. With none set up, requests use the default chain below (line manager → finance → partner above the threshold).
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New workflow</Button>
      </div>
      {isLoading ? null : workflows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No workflows yet. Example: under ₦50,000 → Department head; ₦50,000–₦200,000 → Department head, then Finance; above ₦200,000 → add Managing Partner.
        </p>
      ) : (
        <ul className="space-y-3">
          {workflows.map((w) => (
            <li key={w.id} className={cn('rounded-lg border border-border p-4', !w.is_active && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{w.name} <span className="text-xs font-normal text-muted-foreground">· priority {w.priority}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {range(w)}
                    {w.categories.length > 0 && ` · ${w.categories.map(fundCategoryLabel).join(', ')}`}
                    {w.department_ids.length > 0 && ` · ${w.department_ids.map((id) => departments?.find((d) => d.id === id)?.name ?? '—').join(', ')}`}
                    {w.branch_ids.length > 0 && ` · ${w.branch_ids.length} branch${w.branch_ids.length === 1 ? '' : 'es'}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!w.is_active && <Badge variant="muted">Inactive</Badge>}
                  {w.allow_self_approval && <Badge variant="warning">Self-approval allowed</Badge>}
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit workflow" onClick={() => setEditing(w)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Delete workflow" onClick={() => setDeleting(w)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <ol className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {w.steps.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 && <span className="text-muted-foreground">{w.steps[i - 1].step_order === s.step_order ? '+' : '→'}</span>}
                    <li className="rounded-md bg-muted/60 px-2 py-1"><span className="font-medium">{s.name}</span> <span className="text-muted-foreground">({describeStep(s, nameOf)})</span></li>
                  </React.Fragment>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
      <WorkflowDialog workflow={editing} open={creating || Boolean(editing)} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this workflow?"
        description="Requests already in progress keep their approvers. New requests fall through to the next matching workflow, or the default chain."
        confirmLabel="Delete workflow"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try { await remove.mutateAsync({ id: deleting.id, name: deleting.name }); toast.success('Workflow deleted') }
          catch (err) { toast.error('Could not delete workflow', { description: errorMessage(err) }) }
          setDeleting(null)
        }}
      />
    </Card>
  )
}
