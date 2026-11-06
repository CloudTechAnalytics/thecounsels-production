import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Network, Search, AlertTriangle, Users, Crown, ChevronRight } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { useDepartments } from '@/features/hr/hooks/use-hr'
import { useBranches } from '@/features/branches/hooks/use-branches'
import type { EmployeeRecord } from '@/features/hr/services/employees.service'
import { AdditionalManagers } from '@/features/hr/components/additional-managers'
import { supabase } from '@/shared/lib/supabase'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const ALL = '__all__'
const NONE = '__none__'
const GONE = ['resigned', 'terminated', 'former_employee']

function useSetLineManagers(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, manager }: { ids: string[]; manager: string | null }) => {
      const { data, error } = await supabase.rpc('set_line_managers', { p_org: organizationId!, p_employee_ids: ids, p_manager: manager })
      if (error) throw error
      return data as number
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr'] }),
  })
}

/** One person in the organisation chart, with everyone who reports to them. */
function ChartNode({ e, byManager, depth }: { e: EmployeeRecord; byManager: Map<string, EmployeeRecord[]>; depth: number }) {
  const team = byManager.get(e.id) ?? []
  const [open, setOpen] = React.useState(depth < 2)
  return (
    <li>
      <div className="flex items-center gap-2 py-1">
        {team.length > 0 ? (
          <button onClick={() => setOpen(!open)} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label={open ? 'Collapse' : 'Expand'}>
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
          </button>
        ) : <span className="w-5" />}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {e.first_name[0]}{e.last_name?.[0] ?? ''}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{e.fullName}</span>
          <span className="block truncate text-xs text-muted-foreground">{[e.jobTitleName ?? e.roleName, e.departmentName, e.branchName].filter(Boolean).join(' · ')}</span>
        </span>
        {team.length > 0 && <Badge variant="secondary" className="ml-1 font-normal">{team.length} report{team.length === 1 ? '' : 's'}</Badge>}
      </div>
      {open && team.length > 0 && (
        <ul className="ml-[18px] border-l border-border pl-4">
          {team.map((t) => <ChartNode key={t.id} e={t} byManager={byManager} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  )
}

/** Who reports to whom: set line managers one by one or in bulk, see gaps, view the chart. */
export function TeamStructurePage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const canEdit = has('staff.manage') || has('departments.manage')
  const { data: register = [], isLoading } = useEmployeeRegister(activeOrgId)
  const { data: departments = [] } = useDepartments(activeOrgId)
  const { data: branches = [] } = useBranches(activeOrgId)
  const setManagers = useSetLineManagers(activeOrgId)

  const [view, setView] = React.useState<'list' | 'chart'>('list')
  const [search, setSearch] = React.useState('')
  const [branch, setBranch] = React.useState(ALL)
  const [dept, setDept] = React.useState(ALL)
  const [missingOnly, setMissingOnly] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [bulkManager, setBulkManager] = React.useState('')

  const staff = React.useMemo(() => register.filter((e) => !GONE.includes(e.employment_status)), [register])
  const byId = React.useMemo(() => new Map(staff.map((e) => [e.id, e])), [staff])
  const byManager = React.useMemo(() => {
    const m = new Map<string, EmployeeRecord[]>()
    for (const e of staff) if (e.manager_employee_id && byId.has(e.manager_employee_id)) {
      m.set(e.manager_employee_id, [...(m.get(e.manager_employee_id) ?? []), e])
    }
    return m
  }, [staff, byId])
  const missing = staff.filter((e) => !e.manager_employee_id && !e.reports_to_no_one)
  const alsoReports = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const e of staff) for (const id of e.additionalManagerIds ?? []) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [staff])
  const roots = staff.filter((e) => !e.manager_employee_id || !byId.has(e.manager_employee_id))

  const rows = staff.filter((e) =>
    (!search || e.fullName.toLowerCase().includes(search.toLowerCase())) &&
    (branch === ALL || e.branch_id === branch) &&
    (dept === ALL || e.department_id === dept) &&
    (!missingOnly || (!e.manager_employee_id && !e.reports_to_no_one)))

  const apply = async (ids: string[], manager: string | null, what: string) => {
    try {
      const n = await setManagers.mutateAsync({ ids, manager })
      toast.success(what, { description: `${n} staff updated` })
      setSelected(new Set())
    } catch (err) { toast.error('Could not update line managers', { description: errorMessage(err) }) }
  }
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const managerLabel = (e: EmployeeRecord) => `${e.fullName}${e.hasLogin ? '' : ' (no login)'}`

  return (
    <div>
      <PageHeader
        title="Reporting lines"
        description="Who each person reports to. Line managers approve their team's leave and endorse their fund requests."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Users className="h-5 w-5" /></span>
          <div><p className="text-sm text-muted-foreground">Staff</p><p className="font-display text-2xl font-semibold">{staff.length}</p></div>
        </Card>
        <button type="button" onClick={() => { setMissingOnly(true); setView('list') }} className="text-left">
          <Card className={cn('flex items-center gap-3 p-4 transition-colors hover:border-primary/40', missing.length > 0 && 'border-warning/50 bg-warning/5')}>
            <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', missing.length ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}><AlertTriangle className="h-5 w-5" /></span>
            <div><p className="text-sm text-muted-foreground">Missing a line manager</p><p className="font-display text-2xl font-semibold">{missing.length}</p></div>
          </Card>
        </button>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><Network className="h-5 w-5" /></span>
          <div><p className="text-sm text-muted-foreground">Line managers</p><p className="font-display text-2xl font-semibold">{byManager.size}</p></div>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-border p-0.5">
          {(['list', 'chart'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'list' ? 'List' : 'Organisation chart'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <Skeleton className="h-72 w-full" /> : view === 'chart' ? (
        <Card className="p-5">
          {roots.length === 0 ? <p className="text-sm text-muted-foreground">No staff yet.</p> : (
            <ul className="space-y-1">
              {roots.sort((a, b) => Number(b.reports_to_no_one) - Number(a.reports_to_no_one)).map((r) => (
                <ChartNode key={r.id} e={r} byManager={byManager} depth={0} />
              ))}
            </ul>
          )}
          {missing.length > 0 && <p className="mt-4 text-xs text-warning">{missing.length} staff have no line manager and appear at the top level until one is set.</p>}
        </Card>
      ) : (
        <div className="space-y-4">
          {canEdit && departments.some((d) => d.head_employee_id) && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Quick set-up by department</p>
              <div className="flex flex-wrap gap-2">
                {departments.filter((d) => d.head_employee_id && byId.has(d.head_employee_id)).map((d) => {
                  const members = staff.filter((e) => e.department_id === d.id && e.id !== d.head_employee_id && !e.reports_to_no_one)
                  if (members.length === 0) return null
                  return (
                    <Button key={d.id} size="sm" variant="outline" loading={setManagers.isPending}
                      onClick={() => apply(members.map((m) => m.id), d.head_employee_id, `${byId.get(d.head_employee_id!)!.fullName} now manages ${d.name}`)}>
                      <Crown className="h-4 w-4" /> {d.name}: {byId.get(d.head_employee_id!)!.first_name} manages all {members.length}
                    </Button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Makes the department head the line manager of everyone in that department.</p>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search staff" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {branches.length > 0 && (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>All branches</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            {departments.length > 0 && (
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ALL}>All departments</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
              Missing a line manager only
            </label>
          </div>

          {canEdit && selected.size > 0 && (
            <Card className="flex flex-wrap items-center gap-3 border-primary/40 bg-primary/5 p-3">
              <span className="text-sm font-medium">{selected.size} selected — set their line manager to</span>
              <Select value={bulkManager || NONE} onValueChange={(v) => setBulkManager(v === NONE ? '' : v)}>
                <SelectTrigger className="w-60"><SelectValue placeholder="Choose a line manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose a line manager</SelectItem>
                  {staff.filter((m) => !selected.has(m.id)).map((m) => <SelectItem key={m.id} value={m.id}>{managerLabel(m)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!bulkManager} loading={setManagers.isPending}
                onClick={() => apply([...selected], bulkManager, `${byId.get(bulkManager)?.fullName} set as line manager`)}>Apply</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {canEdit && <th className="w-10 px-4 py-2"><input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Select all"
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>}
                    <th className="px-4 py-2 font-medium">Staff member</th>
                    <th className="px-4 py-2 font-medium">Department · Branch</th>
                    <th className="px-4 py-2 font-medium">Line manager</th>
                    <th className="px-4 py-2 text-right font-medium">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const team = byManager.get(e.id)?.length ?? 0
                    const gap = !e.manager_employee_id && !e.reports_to_no_one
                    return (
                      <tr key={e.id} className="border-b border-border/60 last:border-0">
                        {canEdit && <td className="px-4 py-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.fullName}`} /></td>}
                        <td className="px-4 py-2">
                          <p className="font-medium">{e.fullName}</p>
                          <p className="text-xs text-muted-foreground">{e.jobTitleName ?? e.roleName ?? '—'}</p>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{[e.departmentName, e.branchName].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="px-4 py-2">
                          {e.reports_to_no_one ? (
                            <Badge variant="secondary" className="font-normal"><Crown className="mr-1 h-3 w-3" /> Top of the firm</Badge>
                          ) : canEdit ? (
                            <Select value={e.manager_employee_id ?? NONE}
                              onValueChange={(v) => apply([e.id], v === NONE ? null : v, v === NONE ? 'Line manager removed' : `${e.first_name} now reports to ${byId.get(v)?.fullName}`)}>
                              <SelectTrigger className={cn('h-9 w-60', gap && 'border-warning/60')}><SelectValue placeholder="Choose a line manager" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>No line manager</SelectItem>
                                {staff.filter((m) => m.id !== e.id).map((m) => <SelectItem key={m.id} value={m.id}>{managerLabel(m)}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={cn(gap && 'text-warning')}>{e.managerName ?? 'Not set'}</span>
                          )}
                          {!e.reports_to_no_one && <AdditionalManagers employee={e} staff={staff} canEdit={canEdit} compact />}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{team + (alsoReports.get(e.id) ?? 0) || '—'}</td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No staff match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">Mark someone as “Top of the firm” from their staff record (Employees → open → Employment). Changes are recorded in the audit log.</p>
        </div>
      )}
    </div>
  )
}
