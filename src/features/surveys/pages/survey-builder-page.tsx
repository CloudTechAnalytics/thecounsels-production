import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowDown, ArrowUp, EyeOff, Plus, Trash2, X, Send } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useDepartments, useEmployees } from '@/features/hr/hooks/use-hr'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  QUESTION_KINDS, SURVEY_TEMPLATES, useDeleteSurvey, useSaveSurvey, useSendSurvey, useSurvey, type DraftQuestion, type QuestionKind,
} from '@/features/surveys/hooks/use-surveys'
import { ANNOUNCEMENT_AUDIENCES } from '@/features/hr/types'
import { ROLE_META } from '@/shared/lib/permissions'
import type { RoleKey } from '@/shared/types/database.types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ToggleSwitch } from '@/shared/components/toggle-switch'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const ROLE_OPTIONS = Object.entries(ROLE_META)
  .filter(([key]) => key !== 'platform_owner' && key !== 'platform_admin')
  .sort(([, a], [, b]) => a.rank - b.rank)
  .map(([key, meta]) => ({ key, label: meta.label }))

const blank = (kind: QuestionKind = 'single'): DraftQuestion => ({ kind, prompt: '', options: kind === 'single' || kind === 'multi' ? ['', ''] : [], required: true })

function QuestionEditor({ q, index, count, onChange, onMove, onRemove }: {
  q: DraftQuestion; index: number; count: number; onChange: (q: DraftQuestion) => void; onMove: (d: -1 | 1) => void; onRemove: () => void
}) {
  const hasOptions = q.kind === 'single' || q.kind === 'multi'
  const setKind = (kind: QuestionKind) => onChange({ ...q, kind, options: kind === 'single' || kind === 'multi' ? (q.options.length >= 2 ? q.options : ['', '']) : [] })
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{index + 1}</span>
        <div className="flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Input value={q.prompt} onChange={(e) => onChange({ ...q, prompt: e.target.value })} placeholder="Type the question" />
            <Select value={q.kind} onValueChange={(v) => setKind(v as QuestionKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{QUESTION_KINDS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {hasOptions && (
            <div className="space-y-2">
              {q.options.map((o, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <span className={cn('h-3.5 w-3.5 shrink-0 border border-muted-foreground/50', q.kind === 'single' ? 'rounded-full' : 'rounded-sm')} />
                  <Input className="h-8" value={o} placeholder={`Option ${oi + 1}`}
                    onChange={(e) => onChange({ ...q, options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onChange({ ...q, options: [...q.options, ''] }) } }} />
                  {q.options.length > 2 && (
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange({ ...q, options: q.options.filter((_, i) => i !== oi) })}><X className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...q, options: [...q.options, ''] })}><Plus className="h-3.5 w-3.5" /> Add option</Button>
            </div>
          )}
          {q.kind === 'rating' && <p className="text-xs text-muted-foreground">Staff choose 1 (very poor) to 5 (excellent).</p>}
          {q.kind === 'yesno' && <p className="text-xs text-muted-foreground">Staff answer Yes or No.</p>}
          {q.kind === 'text' && <p className="text-xs text-muted-foreground">Staff type their answer.</p>}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={q.required} onChange={(e) => onChange({ ...q, required: e.target.checked })} /> Must be answered
            </label>
            <div className="flex">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => onMove(-1)} title="Move up"><ArrowUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={index === count - 1} onClick={() => onMove(1)} title="Move down"><ArrowDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemove} title="Remove"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

/** Build a survey (or edit a draft), then send it. Full page. */
export function SurveyBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: existing, isLoading } = useSurvey(id)
  const { data: departments = [] } = useDepartments(activeOrgId)
  const { data: employees = [] } = useEmployees(activeOrgId)
  const { data: branches = [] } = useBranches(activeOrgId)
  const save = useSaveSurvey(activeOrgId)
  const send = useSendSurvey()
  const del = useDeleteSurvey()

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [anonymous, setAnonymous] = React.useState(true)
  const [closesOn, setClosesOn] = React.useState('')
  const [audience, setAudience] = React.useState('organization')
  const [departmentId, setDepartmentId] = React.useState('')
  const [branchId, setBranchId] = React.useState('')
  const [roleKey, setRoleKey] = React.useState('')
  const [people, setPeople] = React.useState<string[]>([])
  const [peopleSearch, setPeopleSearch] = React.useState('')
  const [questions, setQuestions] = React.useState<DraftQuestion[]>([blank('rating')])
  const [busy, setBusy] = React.useState<'save' | 'send' | null>(null)

  React.useEffect(() => {
    if (!existing) return
    const s = existing.survey
    setTitle(s.title); setDescription(s.description ?? ''); setAnonymous(s.anonymous); setClosesOn(s.closes_on ?? '')
    setAudience(s.audience_type); setDepartmentId(s.audience_department_id ?? ''); setBranchId(s.audience_branch_id ?? '')
    setRoleKey(s.audience_role_key ?? ''); setPeople(s.audience_user_ids ?? [])
    setQuestions(existing.questions.map((q) => ({ kind: q.kind, prompt: q.prompt, options: q.options, required: q.required })))
  }, [existing])

  if (id && isLoading) return <Skeleton className="h-96 w-full" />
  if (id && existing && existing.survey.status !== 'draft') {
    return <Card className="p-10 text-center text-muted-foreground">This survey has been sent and can no longer be edited.</Card>
  }

  const applyTemplate = (t: (typeof SURVEY_TEMPLATES)[number]) => {
    setTitle(t.title); setDescription(t.description); setQuestions(t.questions.map((q) => ({ ...q, options: [...q.options] })))
  }
  const move = (i: number, d: -1 | 1) => setQuestions((qs) => { const n = [...qs]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })
  const shownPeople = employees.filter((e) => e.userId && `${e.fullName ?? ''} ${e.email ?? ''}`.toLowerCase().includes(peopleSearch.toLowerCase()))

  const run = async (andSend: boolean) => {
    if (!title.trim()) { toast.error('Give the survey a title'); return }
    const qs = questions.map((q) => ({ ...q, prompt: q.prompt.trim(), options: q.options.map((o) => o.trim()).filter(Boolean) }))
    const bad = qs.findIndex((q) => !q.prompt || ((q.kind === 'single' || q.kind === 'multi') && q.options.length < 2))
    if (bad >= 0) { toast.error(`Question ${bad + 1}: ${qs[bad].prompt ? 'add at least two options' : 'type the question'}`); return }
    if (andSend && qs.length === 0) { toast.error('Add at least one question'); return }
    if (audience === 'department' && !departmentId) { toast.error('Choose a department'); return }
    if (audience === 'branch' && !branchId) { toast.error('Choose a branch'); return }
    if (audience === 'role' && !roleKey) { toast.error('Choose a role'); return }
    if (audience === 'employees' && people.length === 0) { toast.error('Choose at least one person'); return }
    setBusy(andSend ? 'send' : 'save')
    try {
      const sid = await save.mutateAsync({
        id, title: title.trim(), description, anonymous, closesOn, audienceType: audience,
        departmentId: audience === 'department' ? departmentId : null, branchId: audience === 'branch' ? branchId : null,
        roleKey: audience === 'role' ? (roleKey as RoleKey) : null, userIds: audience === 'employees' ? people : null, questions: qs,
      })
      if (andSend) {
        const s = (await send.mutateAsync(sid)) as { recipient_count: number }
        toast.success('Survey sent', { description: `${s.recipient_count} ${s.recipient_count === 1 ? 'person has' : 'people have'} been asked to answer.` })
        navigate(`/hr/surveys/${sid}`, { replace: true })
      } else {
        toast.success('Draft saved')
        if (!id) navigate(`/hr/surveys/${sid}/edit`, { replace: true })
      }
    } catch (err) { toast.error(andSend ? 'Could not send' : 'Could not save', { description: errorMessage(err) }) }
    finally { setBusy(null) }
  }

  const remove = async () => {
    if (!id || !window.confirm('Delete this draft?')) return
    try { await del.mutateAsync(id); navigate('/hr/surveys', { replace: true }) } catch (err) { toast.error('Could not delete', { description: errorMessage(err) }) }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/hr/surveys')}><ArrowLeft className="h-4 w-4" /> Surveys</Button>
      <PageHeader title={id ? 'Edit draft survey' : 'New survey'} description="Write the questions, choose who answers, then send." />

      <div className="space-y-5">
        {!id && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Start from:</span>
            {SURVEY_TEMPLATES.map((t) => <Button key={t.name} variant="outline" size="sm" onClick={() => applyTemplate(t)}>{t.name}</Button>)}
          </div>
        )}

        <Card className="space-y-4 p-5">
          <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. End-of-year staff satisfaction survey" /></div>
          <div className="space-y-1.5"><Label>Introduction (optional)</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why you're asking and how the answers will be used" /></div>
          <ToggleSwitch checked={anonymous} onChange={setAnonymous} icon={EyeOff} label="Anonymous"
            hint={anonymous ? 'Names are never stored with answers. Results appear once at least 3 people have answered.' : 'Each answer is shown with the person’s name.'} />
          <div className="space-y-1.5 sm:max-w-xs"><Label>Closes on (optional)</Label><Input type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} /></div>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-semibold">Questions</p>
          {questions.map((q, i) => (
            <QuestionEditor key={i} q={q} index={i} count={questions.length}
              onChange={(nq) => setQuestions((qs) => qs.map((x, j) => (j === i ? nq : x)))}
              onMove={(d) => move(i, d)} onRemove={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} />
          ))}
          <div className="flex flex-wrap gap-2">
            {QUESTION_KINDS.map((k) => (
              <Button key={k.kind} type="button" variant="outline" size="sm" onClick={() => setQuestions((qs) => [...qs, blank(k.kind)])}><Plus className="h-3.5 w-3.5" /> {k.label}</Button>
            ))}
          </div>
        </div>

        <Card className="space-y-4 p-5">
          <p className="text-sm font-semibold">Who answers it</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Send to</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ANNOUNCEMENT_AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {audience === 'branch' && (
              <div className="space-y-1.5"><Label>Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}><SelectTrigger><SelectValue placeholder="Choose a branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            {audience === 'department' && (
              <div className="space-y-1.5"><Label>Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}><SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger>
                  <SelectContent>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
            {audience === 'role' && (
              <div className="space-y-1.5"><Label>Role</Label>
                <Select value={roleKey} onValueChange={setRoleKey}><SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                  <SelectContent>{ROLE_OPTIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent></Select>
              </div>
            )}
          </div>
          {audience === 'employees' && (
            <div className="space-y-2">
              <Input placeholder="Search people" value={peopleSearch} onChange={(e) => setPeopleSearch(e.target.value)} className="sm:max-w-xs" />
              <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
                {shownPeople.map((e) => (
                  <label key={e.userId} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={people.includes(e.userId!)}
                      onChange={() => setPeople((p) => (p.includes(e.userId!) ? p.filter((x) => x !== e.userId) : [...p, e.userId!]))} />
                    <span className="truncate">{e.fullName ?? e.email}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{people.length} selected</p>
            </div>
          )}
          {anonymous && audience === 'employees' && people.length > 0 && people.length < 3 && (
            <p className="text-xs text-warning">With fewer than 3 people, results of an anonymous survey can never be shown.</p>
          )}
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <div>{id && <Button variant="ghost" className="text-destructive" onClick={remove} loading={del.isPending}><Trash2 className="h-4 w-4" /> Delete draft</Button>}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run(false)} loading={busy === 'save'} disabled={busy != null}>Save draft</Button>
            <Button onClick={() => run(true)} loading={busy === 'send'} disabled={busy != null}><Send className="h-4 w-4" /> Send survey</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
