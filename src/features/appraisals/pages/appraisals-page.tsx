import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronRight, Plus, Star, Users } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMyReports } from '@/features/hr/hooks/use-my-reports'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { STAGES, stageIndex, useAppraisalCycles, useAppraisals, type AppraisalCycle, type AppraisalRow } from '@/features/appraisals/hooks/use-appraisals'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

const stageBadge = (s: AppraisalRow['status']) => {
  const st = STAGES[stageIndex(s)]
  return <Badge variant={s === 'completed' ? 'success' : s === 'sign_off' ? 'warning' : 'default'}>{st.short}</Badge>
}

function ActionFor({ a, me, isTeam }: { a: AppraisalRow; me: string | null; isTeam: boolean }) {
  if (!isTeam && a.status === 'self_review') return <span className="text-sm font-medium text-primary">Fill in →</span>
  if (!isTeam && a.status === 'acknowledge') return <span className="text-sm font-medium text-primary">Read & acknowledge →</span>
  if (isTeam && a.status === 'manager_review' && a.manager_user_id === me) return <span className="text-sm font-medium text-primary">Review →</span>
  return <ChevronRight className="h-4 w-4 text-muted-foreground" />
}

/** Appraisals: my own, my team's, and (for HR) every cycle. */
export function AppraisalsPage() {
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const isHr = has('appraisals.manage')
  const { data: cycles = [], isLoading: lc } = useAppraisalCycles(activeOrgId)
  const { data: rows = [], isLoading: la } = useAppraisals(activeOrgId)
  const { reports } = useMyReports()
  const { data: register = [] } = useEmployeeRegister(isHr ? activeOrgId : null)
  const cycleById = React.useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles])
  const nameOf = (a: AppraisalRow) => reports.find((r) => r.employee_id === a.employee_id)?.full_name ?? register.find((e) => e.id === a.employee_id)?.fullName ?? 'Staff member'

  const mine = rows.filter((a) => a.user_id === userId)
  const team = rows.filter((a) => a.user_id !== userId && (a.manager_user_id === userId || reports.some((r) => r.employee_id === a.employee_id)))
  const teamOpen = team.filter((a) => cycleById.get(a.cycle_id)?.status === 'open' || a.status !== 'completed')
  const progress = (c: AppraisalCycle) => {
    const list = rows.filter((a) => a.cycle_id === c.id)
    return { total: list.length, done: list.filter((a) => a.status === 'completed').length, signOff: list.filter((a) => a.status === 'sign_off').length }
  }

  if (lc || la) return <Skeleton className="h-96 w-full" />

  return (
    <div>
      <PageHeader
        title="Appraisals"
        description="Self-appraisal, line manager review, sign-off and acknowledgement — one place for every performance review."
        actions={isHr ? <Button onClick={() => navigate('/hr/appraisals/cycles/new')}><Plus className="h-4 w-4" /> New appraisal cycle</Button> : undefined}
      />
      <div className="space-y-6">
        <Card className="overflow-hidden">
          <p className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold"><Star className="h-4 w-4 text-primary" /> My appraisals</p>
          {mine.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">You have no appraisals yet.</p> : (
            <ul className="divide-y divide-border">
              {mine.map((a) => {
                const c = cycleById.get(a.cycle_id)
                const due = a.status === 'self_review' ? c?.self_due : null
                const needsMe = a.status === 'self_review' || a.status === 'acknowledge'
                return (
                  <li key={a.id}>
                    <button onClick={() => navigate(`/hr/appraisals/${a.id}`)} className={cn('flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/40', needsMe && 'bg-primary/5')}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{c?.name ?? 'Appraisal'}</p>
                        <p className="text-xs text-muted-foreground">{c ? `${format(new Date(c.period_start), 'MMM yyyy')} – ${format(new Date(c.period_end), 'MMM yyyy')}` : ''}{due ? ` · due ${format(new Date(due), 'd MMM')}` : ''}</p>
                      </div>
                      {stageBadge(a.status)}
                      <ActionFor a={a} me={userId} isTeam={false} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {team.length > 0 && (
          <Card className="overflow-hidden">
            <p className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> My team</p>
            <ul className="divide-y divide-border">
              {teamOpen.map((a) => {
                const c = cycleById.get(a.cycle_id)
                const mineToReview = a.status === 'manager_review' && a.manager_user_id === userId
                return (
                  <li key={a.id}>
                    <button onClick={() => navigate(`/hr/appraisals/${a.id}`)} className={cn('flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/40', mineToReview && 'bg-primary/5')}>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{nameOf(a)}</p>
                        <p className="text-xs text-muted-foreground">{c?.name}{a.manager_user_id !== userId ? ' · you can add your input' : ''}</p>
                      </div>
                      {stageBadge(a.status)}
                      <ActionFor a={a} me={userId} isTeam />
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {isHr && (
          <Card className="overflow-hidden">
            <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">Appraisal cycles</p>
            {cycles.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No cycles yet. Create one — e.g. “2026 Annual Review” — choose who it covers and the competencies, then launch it.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cycles.map((c) => {
                  const p = progress(c)
                  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
                  return (
                    <li key={c.id}>
                      <button onClick={() => navigate(c.status === 'draft' ? `/hr/appraisals/cycles/${c.id}/edit` : `/hr/appraisals/cycles/${c.id}`)}
                        className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(c.period_start), 'd MMM yyyy')} – {format(new Date(c.period_end), 'd MMM yyyy')}{p.signOff ? ` · ${p.signOff} waiting for sign-off` : ''}</p>
                        </div>
                        {c.status !== 'draft' && (
                          <div className="w-40">
                            <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{p.done} of {p.total} done</span><span>{pct}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                          </div>
                        )}
                        <Badge variant={c.status === 'open' ? 'success' : 'muted'}>{c.status === 'draft' ? 'Draft' : c.status === 'open' ? 'Open' : 'Closed'}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
