import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Bell, Download, Lock, Search, UserPlus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  STAGES, ratingLabel, stageIndex, useAddToCycle, useAppraisalCycle, useCloseCycle, useCycleMissing, useCycleProgress, useRemindAppraisals, type AppraisalStatus,
} from '@/features/appraisals/hooks/use-appraisals'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

/** Staff in the cycle's audience who aren't in it yet — joined, or got a
 * login, after it was launched. Tick and add. */
function MissingPeople({ cycleId }: { cycleId: string }) {
  const { data: missing = [] } = useCycleMissing(cycleId, true)
  const add = useAddToCycle()
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  if (missing.length === 0) return null
  const addable = missing.filter((m) => m.can_add)
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  return (
    <Card className="mb-5 space-y-3 border-warning/40 bg-warning/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{missing.length} staff member{missing.length === 1 ? ' is' : 's are'} not in this cycle</p>
        {addable.length > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(addable.map((m) => m.employee_id)))}>Select all</Button>
            <Button size="sm" disabled={picked.size === 0} loading={add.isPending} onClick={() => add.mutate({ cycle: cycleId, employees: [...picked] }, {
              onSuccess: (n) => { toast.success(`${n} added — they’ve been asked to complete their self-appraisal`); setPicked(new Set()) },
              onError: (e) => toast.error('Could not add', { description: errorMessage(e) }),
            })}><UserPlus className="h-4 w-4" /> Add {picked.size || ''} to cycle</Button>
          </div>
        )}
      </div>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {missing.map((m) => (
          <li key={m.employee_id}>
            <label className={cn('flex items-start gap-2 rounded px-2 py-1.5 text-sm', m.can_add ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60')}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" disabled={!m.can_add} checked={picked.has(m.employee_id)} onChange={() => toggle(m.employee_id)} />
              <span>{m.full_name}{m.reason && <span className="block text-xs text-muted-foreground">{m.reason}</span>}</span>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** HR's view of one cycle: where every appraisal is, who's holding it up, final ratings. */
export function AppraisalCyclePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: cycle, isLoading } = useAppraisalCycle(id)
  const { data: rows = [] } = useCycleProgress(id, Boolean(cycle && cycle.status !== 'draft'))
  const { data: branches = [] } = useBranches(activeOrgId)
  const remind = useRemindAppraisals()
  const close = useCloseCycle()
  const [stage, setStage] = React.useState<AppraisalStatus | null>(null)
  const [q, setQ] = React.useState('')

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!cycle) return <Card className="p-10 text-center text-muted-foreground">Cycle not found.</Card>

  const counts = STAGES.map((s) => ({ ...s, n: rows.filter((r) => r.status === s.key).length }))
  const shown = rows.filter((r) => (!stage || r.status === stage) && (!q || `${r.employee_name} ${r.manager_name ?? ''} ${r.department ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const rated = rows.filter((r) => r.final_rating != null)
  const avg = rated.length ? rated.reduce((s, r) => s + Number(r.final_rating), 0) / rated.length : null
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: rated.filter((r) => r.final_rating === n).length }))
  const maxDist = Math.max(1, ...dist.map((d) => d.count))
  const branchName = (bid: string | null) => branches.find((b) => b.id === bid)?.name ?? '—'

  const exportCsv = () => {
    const out = [['Staff member', 'Department', 'Branch', 'Line manager', 'Stage', 'Final rating', 'Agrees']]
      .concat(rows.map((r) => [r.employee_name, r.department ?? '', branchName(r.branch_id), r.manager_name ?? '', STAGES[stageIndex(r.status as AppraisalStatus)].label,
        r.final_rating ? `${r.final_rating} ${ratingLabel(r.final_rating)}` : '', r.employee_agrees == null ? '' : r.employee_agrees ? 'Yes' : 'No']))
    const csv = out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `${cycle.name.replace(/[^\w]+/g, '-').toLowerCase()}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/hr/appraisals')}><ArrowLeft className="h-4 w-4" /> Appraisals</Button>
      <PageHeader
        title={cycle.name}
        description={`${format(new Date(cycle.period_start), 'd MMM yyyy')} – ${format(new Date(cycle.period_end), 'd MMM yyyy')}${cycle.self_due ? ` · self-appraisals due ${format(new Date(cycle.self_due), 'd MMM')}` : ''}${cycle.manager_due ? ` · reviews due ${format(new Date(cycle.manager_due), 'd MMM')}` : ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
            {cycle.status === 'open' && (
              <>
                <Button variant="outline" loading={remind.isPending} onClick={() => remind.mutate(cycle.id, { onSuccess: (n) => toast.success(`${n} reminder${n === 1 ? '' : 's'} sent`), onError: (e) => toast.error('Could not remind', { description: errorMessage(e) }) })}>
                  <Bell className="h-4 w-4" /> Remind
                </Button>
                <Button variant="outline" loading={close.isPending} onClick={() => window.confirm('Close this cycle? Unfinished appraisals can no longer be filled in.') && close.mutate(cycle.id, { onSuccess: () => toast.success('Cycle closed') })}>
                  <Lock className="h-4 w-4" /> Close cycle
                </Button>
              </>
            )}
          </div>
        }
      />

      {cycle.status === 'open' && <MissingPeople cycleId={cycle.id} />}

      <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Progress</p>
          <div className="grid grid-cols-5 gap-2">
            {counts.map((c) => (
              <button key={c.key} onClick={() => setStage(stage === c.key ? null : c.key)}
                className={cn('rounded-lg border p-3 text-left transition-colors', stage === c.key ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50')}>
                <p className="font-display text-2xl font-semibold tabular-nums">{c.n}</p>
                <p className="text-[11px] leading-tight text-muted-foreground">{c.short}</p>
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-semibold">Final ratings</p>
            <p className="text-xs text-muted-foreground">{avg != null ? `avg ${avg.toFixed(1)}` : 'none yet'}</p>
          </div>
          <div className="space-y-1.5">
            {dist.map((d) => (
              <div key={d.n} className="flex items-center gap-2 text-xs" title={`${d.n} · ${ratingLabel(d.n)}: ${d.count}`}>
                <span className="w-3 tabular-nums text-muted-foreground">{d.n}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(d.count / maxDist) * 100}%` }} /></div>
                <span className="w-5 text-right tabular-nums">{d.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-3 relative w-64">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search staff or manager" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Staff member</th><th className="px-4 py-2 font-medium">Line manager</th>
              <th className="px-4 py-2 font-medium">Stage</th><th className="px-4 py-2 font-medium">Final rating</th>
            </tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/hr/appraisals/${r.id}`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5"><p className="font-medium">{r.employee_name}</p><p className="text-xs text-muted-foreground">{[r.department, branchName(r.branch_id)].filter((x) => x && x !== '—').join(' · ')}</p></td>
                  <td className="px-4 py-2.5">{r.manager_name ?? <span className="text-warning">None — HR reviews</span>}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={r.status === 'completed' ? 'success' : r.status === 'sign_off' ? 'warning' : 'default'}>{STAGES[stageIndex(r.status as AppraisalStatus)].short}</Badge>
                    {r.employee_agrees === false && <Badge variant="destructive" className="ml-1.5">Disagrees</Badge>}
                  </td>
                  <td className="px-4 py-2.5">{r.final_rating ? `${r.final_rating} · ${ratingLabel(r.final_rating)}` : '—'}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
