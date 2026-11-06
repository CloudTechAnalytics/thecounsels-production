import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Rocket, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useDepartments } from '@/features/hr/hooks/use-hr'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  DEFAULT_COMPETENCIES, competenciesOf, useAppraisalCycle, useDeleteCycle, useLaunchCycle, useSaveCycle, type Competency,
} from '@/features/appraisals/hooks/use-appraisals'
import type { Json } from '@/shared/types/database.types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

/** Set up an appraisal cycle (or edit a draft), then launch it. */
export function AppraisalCycleFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: existing, isLoading } = useAppraisalCycle(id)
  const { data: branches = [] } = useBranches(activeOrgId)
  const { data: departments = [] } = useDepartments(activeOrgId)
  const save = useSaveCycle(activeOrgId)
  const launch = useLaunchCycle()
  const del = useDeleteCycle()
  const year = new Date().getFullYear()

  const [name, setName] = React.useState(`${year} Annual Review`)
  const [start, setStart] = React.useState(`${year}-01-01`)
  const [end, setEnd] = React.useState(`${year}-12-31`)
  const [selfDue, setSelfDue] = React.useState('')
  const [managerDue, setManagerDue] = React.useState('')
  const [audience, setAudience] = React.useState<'organization' | 'branch' | 'department'>('organization')
  const [branchId, setBranchId] = React.useState('')
  const [departmentId, setDepartmentId] = React.useState('')
  const [comps, setComps] = React.useState<Competency[]>(DEFAULT_COMPETENCIES)
  const [busy, setBusy] = React.useState<'save' | 'launch' | null>(null)

  React.useEffect(() => {
    if (!existing) return
    setName(existing.name); setStart(existing.period_start); setEnd(existing.period_end)
    setSelfDue(existing.self_due ?? ''); setManagerDue(existing.manager_due ?? '')
    setAudience(existing.audience_type); setBranchId(existing.audience_branch_id ?? ''); setDepartmentId(existing.audience_department_id ?? '')
    setComps(competenciesOf(existing))
  }, [existing])

  if (id && isLoading) return <Skeleton className="h-96 w-full" />
  if (existing && existing.status !== 'draft') return <Card className="p-10 text-center text-muted-foreground">This cycle has been launched and can’t be edited.</Card>

  const move = (i: number, d: -1 | 1) => setComps((c) => { const n = [...c]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })

  const run = async (andLaunch: boolean) => {
    const list = comps.map((c) => ({ name: c.name.trim(), description: c.description?.trim() || undefined })).filter((c) => c.name)
    if (!name.trim()) { toast.error('Name the cycle'); return }
    if (!start || !end || end < start) { toast.error('Check the review period'); return }
    if (list.length === 0) { toast.error('Add at least one competency'); return }
    if (audience === 'branch' && !branchId) { toast.error('Choose the branch'); return }
    if (audience === 'department' && !departmentId) { toast.error('Choose the department'); return }
    if (andLaunch && !window.confirm('Launch this cycle? Everyone it covers will be asked to complete their self-appraisal. The cycle can’t be edited afterwards.')) return
    setBusy(andLaunch ? 'launch' : 'save')
    try {
      const cid = await save.mutateAsync({
        id, name: name.trim(), period_start: start, period_end: end, self_due: selfDue || null, manager_due: managerDue || null,
        audience_type: audience, audience_branch_id: audience === 'branch' ? branchId : null, audience_department_id: audience === 'department' ? departmentId : null,
        competencies: list as unknown as Json,
      })
      if (andLaunch) {
        const n = await launch.mutateAsync(cid)
        toast.success('Cycle launched', { description: `${n} appraisal${n === 1 ? '' : 's'} started — staff have been notified.` })
        navigate(`/hr/appraisals/cycles/${cid}`, { replace: true })
      } else {
        toast.success('Draft saved')
        if (!id) navigate(`/hr/appraisals/cycles/${cid}/edit`, { replace: true })
      }
    } catch (err) { toast.error(andLaunch ? 'Could not launch' : 'Could not save', { description: errorMessage(err) }) }
    finally { setBusy(null) }
  }

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/hr/appraisals')}><ArrowLeft className="h-4 w-4" /> Appraisals</Button>
      <PageHeader title={id ? 'Edit appraisal cycle' : 'New appraisal cycle'} description="Who is reviewed, for which period, on what — then launch it." />
      <div className="space-y-5">
        <Card className="space-y-4 p-5">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Period from</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Period to</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Self-appraisals due</Label><Input type="date" value={selfDue} onChange={(e) => setSelfDue(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Manager reviews due</Label><Input type="date" value={managerDue} onChange={(e) => setManagerDue(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">After a due date passes, whoever is holding an appraisal up is reminded every 3 days.</p>
        </Card>

        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold">Who is appraised</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select value={audience} onValueChange={(v) => setAudience(v as typeof audience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="organization">Everyone in the firm</SelectItem>
                <SelectItem value="branch">One branch</SelectItem>
                <SelectItem value="department">One department</SelectItem>
              </SelectContent>
            </Select>
            {audience === 'branch' && (
              <Select value={branchId} onValueChange={setBranchId}><SelectTrigger><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
            )}
            {audience === 'department' && (
              <Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger>
                <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Active staff with a login. Each person’s main line manager reviews them; their other line managers can add input. Set reporting lines first under Reporting Lines.</p>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Competencies</p>
              <p className="text-xs text-muted-foreground">Rated 1 (unsatisfactory) to 5 (outstanding) by the staff member and their line manager. Staff also add their own goals.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setComps((c) => [...c, { name: '', description: '' }])}><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
          <ul className="space-y-2">
            {comps.map((c, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-border p-2">
                <div className="flex-1 space-y-1.5">
                  <Input value={c.name} placeholder="Competency" className="font-medium" onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  <Input value={c.description ?? ''} placeholder="What good looks like (optional)" className="h-8 text-xs" onChange={(e) => setComps((x) => x.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} />
                </div>
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === comps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setComps((x) => x.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div>{id && <Button variant="ghost" className="text-destructive" loading={del.isPending}
            onClick={() => window.confirm('Delete this draft cycle?') && del.mutate(id, { onSuccess: () => navigate('/hr/appraisals', { replace: true }) })}><Trash2 className="h-4 w-4" /> Delete draft</Button>}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run(false)} loading={busy === 'save'} disabled={busy != null}>Save draft</Button>
            <Button onClick={() => run(true)} loading={busy === 'launch'} disabled={busy != null}><Rocket className="h-4 w-4" /> Launch cycle</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
