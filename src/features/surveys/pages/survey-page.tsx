import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Bell, CheckCircle2, Download, EyeOff, Lock, Star, Users } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployees } from '@/features/hr/hooks/use-hr'
import {
  RATING_LABELS, surveyState, useCloseSurvey, useRemindSurvey, useSubmitSurvey, useSurvey, useSurveyRecipients, useSurveyResults,
  type QuestionResult, type Survey, type SurveyQuestion,
} from '@/features/surveys/hooks/use-surveys'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

type Answer = string | string[] | number

// ── Answering ───────────────────────────────────────────────────────────────
function AnswerForm({ survey, questions }: { survey: Survey; questions: SurveyQuestion[] }) {
  const submit = useSubmitSurvey()
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({})
  const [missing, setMissing] = React.useState<string | null>(null)
  const set = (id: string, v: Answer) => { setAnswers((a) => ({ ...a, [id]: v })); if (missing === id) setMissing(null) }
  const isEmpty = (v: Answer | undefined) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

  const run = async () => {
    const first = questions.find((q) => q.required && isEmpty(answers[q.id]))
    if (first) {
      setMissing(first.id)
      document.getElementById(`q-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      toast.error(`Please answer question ${first.position}`)
      return
    }
    const clean = Object.fromEntries(Object.entries(answers).filter(([, v]) => !isEmpty(v)))
    try { await submit.mutateAsync({ id: survey.id, answers: clean }); toast.success('Thank you — your answers were sent') }
    catch (err) { toast.error('Could not send your answers', { description: errorMessage(err) }) }
  }

  return (
    <div className="space-y-4">
      <Card className={cn('flex items-center gap-3 p-4 text-sm', survey.anonymous ? 'border-success/40 bg-success/5' : 'bg-muted/40')}>
        {survey.anonymous ? <EyeOff className="h-4 w-4 shrink-0 text-success" /> : <Users className="h-4 w-4 shrink-0 text-muted-foreground" />}
        {survey.anonymous
          ? 'This survey is anonymous. Your name is not stored with your answers, and results are only shown once at least 3 people have answered.'
          : 'This survey is not anonymous — your name will be shown with your answers.'}
      </Card>
      {questions.map((q) => {
        const v = answers[q.id]
        return (
          <Card key={q.id} id={`q-${q.id}`} className={cn('space-y-3 p-5 transition-colors', missing === q.id && 'border-destructive')}>
            <p className="font-medium">
              <span className="mr-2 text-muted-foreground">{q.position}.</span>{q.prompt}
              {!q.required && <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>}
            </p>
            {(q.kind === 'single' || q.kind === 'yesno') && (
              <div className={cn('grid gap-2', q.kind === 'yesno' ? 'grid-cols-2 sm:max-w-xs' : 'sm:grid-cols-2')}>
                {(q.kind === 'yesno' ? ['Yes', 'No'] : q.options).map((o) => (
                  <button key={o} type="button" onClick={() => set(q.id, o)}
                    className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      v === o ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50')}>
                    <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', v === o ? 'border-primary' : 'border-muted-foreground/50')}>
                      {v === o && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    {o}
                  </button>
                ))}
              </div>
            )}
            {q.kind === 'multi' && (
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o) => {
                  const list = (Array.isArray(v) ? v : []) as string[]
                  const on = list.includes(o)
                  return (
                    <label key={o} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors', on ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:border-primary/50')}>
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={on} onChange={() => set(q.id, on ? list.filter((x) => x !== o) : [...list, o])} />
                      {o}
                    </label>
                  )
                })}
              </div>
            )}
            {q.kind === 'rating' && (
              <div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => set(q.id, n)} title={RATING_LABELS[n - 1]}
                      className={cn('flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                        v === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>{n}</button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{typeof v === 'number' ? RATING_LABELS[v - 1] : '1 = very poor · 5 = excellent'}</p>
              </div>
            )}
            {q.kind === 'text' && <Textarea rows={3} maxLength={4000} value={(v as string) ?? ''} onChange={(e) => set(q.id, e.target.value)} placeholder="Your answer" />}
          </Card>
        )
      })}
      <div className="flex justify-end"><Button size="lg" onClick={run} loading={submit.isPending}>Send my answers</Button></div>
    </div>
  )
}

// ── Results ─────────────────────────────────────────────────────────────────
function Bars({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = total ? Math.round((r.count / total) * 100) : 0
        return (
          <div key={r.label} className="group" title={`${r.label}: ${r.count} (${pct}%)`}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span>{r.label}</span>
              <span className="tabular-nums text-muted-foreground">{r.count} · {pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-opacity group-hover:opacity-80" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function QuestionResultCard({ q, anonymous }: { q: QuestionResult; anonymous: boolean }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium"><span className="mr-2 text-muted-foreground">{q.position}.</span>{q.prompt}</p>
        <span className="text-xs text-muted-foreground">{q.answered} answered</span>
      </div>
      {(q.kind === 'single' || q.kind === 'multi') && (
        <>
          <Bars rows={q.options.map((o) => ({ label: o, count: q.counts[o] ?? 0 }))} total={q.answered} />
          {q.kind === 'multi' && <p className="text-xs text-muted-foreground">People could tick more than one, so percentages add up to more than 100%.</p>}
        </>
      )}
      {q.kind === 'yesno' && <Bars rows={['Yes', 'No'].map((o) => ({ label: o, count: q.counts[o] ?? 0 }))} total={q.answered} />}
      {q.kind === 'rating' && (
        <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
          <div>
            <p className="font-display text-4xl font-semibold tabular-nums">{q.average != null ? Number(q.average).toFixed(1) : '—'}</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Star className="h-3 w-3" /> average out of 5</p>
            {q.average != null && <p className="mt-1 text-sm">{RATING_LABELS[Math.round(Number(q.average)) - 1]}</p>}
          </div>
          <Bars rows={[5, 4, 3, 2, 1].map((n) => ({ label: `${n} · ${RATING_LABELS[n - 1]}`, count: q.ratings[String(n)] ?? 0 }))} total={q.answered} />
        </div>
      )}
      {q.kind === 'text' && (
        q.texts.length === 0 ? <p className="text-sm text-muted-foreground">No written answers.</p> : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {q.texts.map((t, i) => (
              <li key={i} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                “{t.text}”{!anonymous && t.name && <span className="ml-1 text-xs text-muted-foreground">— {t.name}</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  )
}

function exportResults(survey: Survey, questions: QuestionResult[]) {
  const rows: (string | number)[][] = [['Question', 'Answer', 'Count / text']]
  for (const q of questions) {
    if (q.kind === 'text') q.texts.forEach((t) => rows.push([q.prompt, survey.anonymous ? '' : t.name ?? '', t.text]))
    else if (q.kind === 'rating') { [1, 2, 3, 4, 5].forEach((n) => rows.push([q.prompt, String(n), q.ratings[String(n)] ?? 0])); rows.push([q.prompt, 'Average', q.average ?? '']) }
    else (q.kind === 'yesno' ? ['Yes', 'No'] : q.options).forEach((o) => rows.push([q.prompt, o, q.counts[o] ?? 0]))
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${survey.title.replace(/[^\w]+/g, '-').toLowerCase()}-results.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Results({ survey }: { survey: Survey }) {
  const { activeOrgId } = useAuth()
  const { data: results, isLoading } = useSurveyResults(survey.id, true)
  const { data: recipients = [] } = useSurveyRecipients(survey.id, true)
  const { data: employees = [] } = useEmployees(activeOrgId)
  const remind = useRemindSurvey()
  const close = useCloseSurvey()
  const [showPending, setShowPending] = React.useState(false)
  const name = (uid: string) => employees.find((e) => e.userId === uid)?.fullName ?? 'Staff member'
  const pending = recipients.filter((r) => !r.responded_at)
  const rate = survey.recipient_count ? Math.round((survey.response_count / survey.recipient_count) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Responses</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{survey.response_count} <span className="text-base font-normal text-muted-foreground">of {survey.recipient_count}</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} /></div>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Response rate</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{rate}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">{survey.status === 'open' ? 'Closes' : 'Closed'}</p>
          <p className="font-display text-2xl font-semibold">{survey.status === 'open' ? (survey.closes_on ? format(new Date(survey.closes_on), 'd MMM') : 'When you close it') : survey.closed_at ? format(new Date(survey.closed_at), 'd MMM') : '—'}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {survey.status === 'open' && pending.length > 0 && (
          <Button variant="outline" loading={remind.isPending} onClick={() => remind.mutate(survey.id, { onSuccess: (n) => toast.success(`Reminder sent to ${n} ${n === 1 ? 'person' : 'people'}`), onError: (e) => toast.error('Could not remind', { description: errorMessage(e) }) })}>
            <Bell className="h-4 w-4" /> Remind {pending.length} who haven’t answered
          </Button>
        )}
        {survey.status === 'open' && (
          <Button variant="outline" loading={close.isPending} onClick={() => window.confirm('Close this survey? Nobody else will be able to answer.') && close.mutate(survey.id, { onSuccess: () => toast.success('Survey closed'), onError: (e) => toast.error('Could not close', { description: errorMessage(e) }) })}>
            <Lock className="h-4 w-4" /> Close survey
          </Button>
        )}
        {results?.questions && <Button variant="outline" onClick={() => exportResults(survey, results.questions!)}><Download className="h-4 w-4" /> Export</Button>}
        {pending.length > 0 && <Button variant="ghost" onClick={() => setShowPending((v) => !v)}>{showPending ? 'Hide' : 'Show'} who hasn’t answered</Button>}
      </div>
      {showPending && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Not answered yet ({pending.length})</p>
          <div className="flex flex-wrap gap-1.5">{pending.map((r) => <Badge key={r.user_id} variant="muted">{name(r.user_id)}</Badge>)}</div>
          {survey.anonymous && <p className="mt-2 text-xs text-muted-foreground">You can see who has answered so you can remind people — never what they answered.</p>}
        </Card>
      )}

      {isLoading ? <Skeleton className="h-64 w-full" /> : results?.hidden ? (
        <Card className="p-10 text-center">
          <EyeOff className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <p className="font-medium">Results appear once 3 people have answered</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">This survey is anonymous. With fewer answers it would be easy to tell who said what, so results stay hidden until then ({results.responses} so far).</p>
        </Card>
      ) : results?.questions?.length ? (
        results.questions.map((q) => <QuestionResultCard key={q.id} q={q} anonymous={survey.anonymous} />)
      ) : null}
    </div>
  )
}

/** One survey: answer it if it's waiting for you; HR sees the live results. */
export function SurveyPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userId } = useAuth()
  const { has } = usePermissions()
  const manager = has('surveys.manage')
  const { data, isLoading } = useSurvey(id)
  const { data: myRow = [] } = useSurveyRecipients(id, true)
  const [view, setView] = React.useState<'answer' | 'results' | null>(null)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!data) return <Card className="p-10 text-center text-muted-foreground">This survey doesn’t exist or wasn’t sent to you.</Card>
  const { survey, questions } = data
  const me = myRow.find((r) => r.user_id === userId)
  const today = format(new Date(), 'yyyy-MM-dd')
  const canAnswer = Boolean(me && !me.responded_at && survey.status === 'open' && (!survey.closes_on || survey.closes_on >= today))
  const mode = view ?? (canAnswer ? 'answer' : manager ? 'results' : null)
  const st = surveyState(survey)

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/hr/surveys')}><ArrowLeft className="h-4 w-4" /> Surveys</Button>
      <PageHeader
        title={survey.title}
        description={survey.description ?? undefined}
        actions={<div className="flex items-center gap-2">{survey.anonymous && <Badge variant="muted"><EyeOff className="mr-1 h-3 w-3" /> Anonymous</Badge>}<Badge variant={st.variant}>{st.label}</Badge></div>}
      />
      {manager && canAnswer && (
        <div className="mb-4 flex w-fit rounded-lg border border-border p-0.5">
          {(['answer', 'results'] as const).map((m) => (
            <button key={m} onClick={() => setView(m)} className={cn('rounded-md px-3 py-1 text-sm font-medium', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {m === 'answer' ? 'My answers' : 'Results'}
            </button>
          ))}
        </div>
      )}
      {mode === 'answer' && <AnswerForm survey={survey} questions={questions} />}
      {mode === 'results' && <Results survey={survey} />}
      {mode == null && (
        <Card className="p-10 text-center">
          {me?.responded_at ? (
            <><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" /><p className="font-medium">Thank you — your answers were received.</p></>
          ) : (
            <p className="text-muted-foreground">This survey is closed.</p>
          )}
        </Card>
      )}
    </div>
  )
}
