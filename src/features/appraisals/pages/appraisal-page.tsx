import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Check, Plus, Printer, Trash2, Undo2, PenLine, Lock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  RATING_SCALE, RECOMMENDATIONS, STAGES, ratingLabel, stageIndex, useAcknowledge, useAddInput, useAppraisal, useSaveManager, useSaveSelf, useSignOff,
  type AppraisalDetail, type GoalInput, type ScoreInput,
} from '@/features/appraisals/hooks/use-appraisals'
import { printAppraisal } from '@/features/appraisals/lib/print-appraisal'
import { getSignatures, openBlankPrintWindow } from '@/shared/lib/signatures'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const NONE = '__none__'

function RatingPicker({ value, onChange, disabled }: { value: number | null; onChange?: (n: number) => void; disabled?: boolean }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {RATING_SCALE.map((r) => (
          <button key={r.value} type="button" disabled={disabled || !onChange} title={r.label} onClick={() => onChange?.(r.value)}
            className={cn('flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition-colors',
              value === r.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              onChange && !disabled && value !== r.value && 'hover:border-primary/60', (!onChange || disabled) && 'cursor-default')}>
            {r.value}
          </button>
        ))}
      </div>
      <p className="mt-1 h-4 text-xs text-muted-foreground">{ratingLabel(value)}</p>
    </div>
  )
}

/** Read-only rating: five dots and the number. */
function RatingDots({ value, label }: { value: number | null | undefined; label?: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">{label ? `${label}: ` : ''}—</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" title={ratingLabel(value)}>
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={cn('h-2 w-2 rounded-full', i <= value ? 'bg-primary' : 'bg-muted')} />)}</span>
      <b className="tabular-nums">{value}</b>
    </span>
  )
}

function Stepper({ status }: { status: AppraisalDetail['appraisal']['status'] }) {
  const at = stageIndex(status)
  return (
    <ol className="mb-6 grid grid-cols-5 gap-1.5">
      {STAGES.map((s, i) => (
        <li key={s.key} className="min-w-0">
          <div className={cn('h-1.5 rounded-full', i < at || status === 'completed' ? 'bg-primary' : i === at ? 'bg-primary/50' : 'bg-muted')} />
          <p className={cn('mt-1.5 truncate text-[11px]', i === at ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{s.label}</p>
        </li>
      ))}
    </ol>
  )
}

// ── The two editable sides (self / manager) share one form ──────────────────
function ReviewForm({ d, side }: { d: AppraisalDetail; side: 'self' | 'manager' }) {
  const a = d.appraisal
  const saveSelf = useSaveSelf()
  const saveMgr = useSaveManager()
  const busy = saveSelf.isPending || saveMgr.isPending
  const mine = side === 'self' ? 'self' : 'manager'
  const [scores, setScores] = React.useState<ScoreInput[]>(() => d.cycle.competencies.map((_, i) => {
    const s = d.scores.find((x) => x.competency === i)
    return { competency: i, rating: s?.[`${mine}_rating`] ?? null, comment: s?.[`${mine}_comment`] ?? '' }
  }))
  const [goals, setGoals] = React.useState<GoalInput[]>(() => d.goals.map((g) => ({ id: g.id, title: g.title, rating: g[`${mine}_rating`], comment: g[`${mine}_comment`] ?? '' })))
  const [summary, setSummary] = React.useState((side === 'self' ? a.self_summary : a.manager_summary) ?? '')
  const [overall, setOverall] = React.useState<number | null>(side === 'self' ? a.self_overall : a.manager_overall)
  const [recommendation, setRecommendation] = React.useState(a.manager_recommendation ?? '')
  const setScore = (i: number, p: Partial<ScoreInput>) => setScores((s) => s.map((x) => (x.competency === i ? { ...x, ...p } : x)))
  const setGoal = (i: number, p: Partial<GoalInput>) => setGoals((g) => g.map((x, j) => (j === i ? { ...x, ...p } : x)))

  const run = async (submit: boolean) => {
    if (submit) {
      const missing = scores.findIndex((s) => !s.rating)
      if (missing >= 0) { toast.error(`Rate “${d.cycle.competencies[missing].name}”`); return }
      if (!overall) { toast.error('Choose the overall rating'); return }
      if (!window.confirm(side === 'self' ? 'Submit your self-appraisal to your line manager? You can’t change it afterwards.' : 'Submit your review for sign-off? You can’t change it afterwards.')) return
    }
    const cleanGoals = goals.filter((g) => g.title.trim())
    try {
      if (side === 'self') await saveSelf.mutateAsync({ id: a.id, scores, goals: cleanGoals, summary, overall, submit })
      else await saveMgr.mutateAsync({ id: a.id, scores, goals: cleanGoals, summary, overall, recommendation, submit })
      toast.success(submit ? (side === 'self' ? 'Submitted to your line manager' : 'Submitted for sign-off') : 'Draft saved')
    } catch (err) { toast.error('Could not save', { description: errorMessage(err) }) }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <p className="border-b border-border bg-muted/30 px-5 py-2.5 text-sm font-semibold">{side === 'self' ? 'Rate yourself on each competency' : `Your rating of ${a.employee_name}`}</p>
        <ul className="divide-y divide-border">
          {d.cycle.competencies.map((c, i) => {
            const s = scores[i]
            const theirs = d.scores.find((x) => x.competency === i)
            return (
              <li key={i} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_220px]">
                <div className="space-y-2">
                  <div>
                    <p className="font-medium">{c.name}</p>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  </div>
                  {side === 'manager' && (
                    <div className="rounded-md bg-muted/40 px-3 py-2">
                      <RatingDots value={theirs?.self_rating} label="Their self-rating" />
                      {theirs?.self_comment && <p className="mt-1 text-xs text-muted-foreground">“{theirs.self_comment}”</p>}
                    </div>
                  )}
                  <Input value={s.comment} onChange={(e) => setScore(i, { comment: e.target.value })} placeholder={side === 'self' ? 'Example or evidence (optional)' : 'Comment (optional)'} />
                </div>
                <RatingPicker value={s.rating} onChange={(n) => setScore(i, { rating: n })} />
              </li>
            )
          })}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-2.5">
          <p className="text-sm font-semibold">Goals for the period</p>
          <Button size="sm" variant="ghost" onClick={() => setGoals((g) => [...g, { title: '', rating: null, comment: '' }])}><Plus className="h-3.5 w-3.5" /> Add goal</Button>
        </div>
        {goals.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">{side === 'self' ? 'Add the objectives you worked towards, e.g. “Handle 3 trials as lead counsel”.' : 'No goals recorded.'}</p>
        ) : (
          <ul className="divide-y divide-border">
            {goals.map((g, i) => {
              const orig = d.goals.find((x) => x.id === g.id)
              return (
                <li key={g.id ?? `new-${i}`} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_220px]">
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input value={g.title} onChange={(e) => setGoal(i, { title: e.target.value })} placeholder="The goal" className="font-medium" />
                      <Button variant="ghost" size="icon" onClick={() => setGoals((x) => x.filter((_, j) => j !== i))} title="Remove"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    {side === 'manager' && orig && (
                      <div className="rounded-md bg-muted/40 px-3 py-2">
                        <RatingDots value={orig.self_rating} label="Their self-rating" />
                        {orig.self_comment && <p className="mt-1 text-xs text-muted-foreground">“{orig.self_comment}”</p>}
                      </div>
                    )}
                    <Input value={g.comment} onChange={(e) => setGoal(i, { comment: e.target.value })} placeholder="How it went (optional)" />
                  </div>
                  <RatingPicker value={g.rating} onChange={(n) => setGoal(i, { rating: n })} />
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        {side === 'manager' && a.self_summary && (
          <div className="rounded-md bg-muted/40 p-3 text-sm"><p className="mb-1 text-xs font-medium text-muted-foreground">Their summary</p>{a.self_summary}</div>
        )}
        <div className="space-y-1.5">
          <Label>{side === 'self' ? 'Your summary of the period' : 'Your overall assessment'}</Label>
          <Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder={side === 'self' ? 'Achievements, challenges, and the support or training you’d like' : 'Strengths, areas to improve, and how they handled their goals'} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Overall rating</Label>
            <RatingPicker value={overall} onChange={setOverall} />
            {side === 'manager' && <RatingDots value={a.self_overall} label="Their overall self-rating" />}
          </div>
          {side === 'manager' && (
            <div className="space-y-1.5">
              <Label>Your recommendation</Label>
              <Select value={recommendation || NONE} onValueChange={(v) => setRecommendation(v === NONE ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No recommendation</SelectItem>
                  {RECOMMENDATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => run(false)} disabled={busy}>Save draft</Button>
        <Button onClick={() => run(true)} loading={busy}><Check className="h-4 w-4" /> {side === 'self' ? 'Submit to line manager' : 'Submit for sign-off'}</Button>
      </div>
    </div>
  )
}

// ── Read-only side-by-side view ─────────────────────────────────────────────
function Summary({ d }: { d: AppraisalDetail }) {
  const a = d.appraisal
  const showMgr = d.scores.some((s) => s.manager_rating != null) || a.manager_overall != null
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Self rating</p><p className="font-display text-2xl font-semibold">{a.self_overall ?? '—'}</p><p className="text-xs text-muted-foreground">{ratingLabel(a.self_overall)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Line manager</p><p className="font-display text-2xl font-semibold">{a.manager_overall ?? (showMgr ? '—' : <Lock className="mt-1 h-5 w-5 text-muted-foreground" />)}</p><p className="text-xs text-muted-foreground">{ratingLabel(a.manager_overall)}</p></Card>
        <Card className={cn('p-4', a.final_rating && 'border-primary bg-primary/5')}><p className="text-xs text-muted-foreground">Final rating</p><p className="font-display text-2xl font-semibold">{a.final_rating ?? '—'}</p><p className="text-xs text-muted-foreground">{ratingLabel(a.final_rating)}</p></Card>
      </div>
      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px] gap-3 border-b border-border bg-muted/30 px-5 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Competency</span><span>Self</span><span>Manager</span>
        </div>
        <ul className="divide-y divide-border">
          {d.cycle.competencies.map((c, i) => {
            const s = d.scores.find((x) => x.competency === i)
            return (
              <li key={i} className="grid grid-cols-[1fr_120px_120px] gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">{c.name}</p>
                  {s?.self_comment && <p className="text-xs text-muted-foreground">Self: “{s.self_comment}”</p>}
                  {s?.manager_comment && <p className="text-xs text-muted-foreground">Manager: “{s.manager_comment}”</p>}
                </div>
                <RatingDots value={s?.self_rating} />
                <RatingDots value={s?.manager_rating} />
              </li>
            )
          })}
          {d.goals.map((g) => (
            <li key={g.id} className="grid grid-cols-[1fr_120px_120px] gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium"><Badge variant="muted" className="mr-1.5">Goal</Badge>{g.title}</p>
                {g.self_comment && <p className="text-xs text-muted-foreground">Self: “{g.self_comment}”</p>}
                {g.manager_comment && <p className="text-xs text-muted-foreground">Manager: “{g.manager_comment}”</p>}
              </div>
              <RatingDots value={g.self_rating} />
              <RatingDots value={g.manager_rating} />
            </li>
          ))}
        </ul>
      </Card>
      {(a.self_summary || a.manager_summary || a.manager_recommendation || a.recommendation || a.sign_off_comment) && (
        <Card className="space-y-3 p-5 text-sm">
          {a.self_summary && <div><p className="text-xs font-medium text-muted-foreground">Staff member’s summary</p><p className="whitespace-pre-wrap">{a.self_summary}</p></div>}
          {a.manager_summary && <div><p className="text-xs font-medium text-muted-foreground">Line manager’s assessment</p><p className="whitespace-pre-wrap">{a.manager_summary}</p></div>}
          {a.manager_recommendation && <div><p className="text-xs font-medium text-muted-foreground">Line manager recommends</p><p>{a.manager_recommendation}</p></div>}
          {(a.recommendation || a.sign_off_comment) && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-medium text-muted-foreground">Final decision{a.signed_off_by_name ? ` · ${a.signed_off_by_name}` : ''}</p>
              {a.recommendation && <p className="font-medium">{a.recommendation}</p>}
              {a.sign_off_comment && <p className="whitespace-pre-wrap">{a.sign_off_comment}</p>}
            </div>
          )}
          {a.acknowledged_at && (
            <div className={cn('rounded-md border p-3', a.employee_agrees ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5')}>
              <p className="text-xs font-medium text-muted-foreground">{a.employee_name} {a.employee_agrees ? 'agrees' : 'does not agree'} · {format(new Date(a.acknowledged_at), 'd MMM yyyy')}{a.employee_signed ? ' · signed' : ''}</p>
              {a.employee_comment && <p className="whitespace-pre-wrap">{a.employee_comment}</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function InputsPanel({ d }: { d: AppraisalDetail }) {
  const add = useAddInput()
  const mineExisting = d.viewer_role === 'line_manager' ? d.inputs[0] : undefined
  const [rating, setRating] = React.useState<number | null>(mineExisting?.rating ?? null)
  const [comment, setComment] = React.useState(mineExisting?.comment ?? '')
  const canAdd = d.viewer_role === 'line_manager' && ['self_review', 'manager_review', 'sign_off'].includes(d.appraisal.status)

  if (d.viewer_role === 'line_manager') {
    return (
      <Card className="space-y-3 p-5">
        <div>
          <p className="text-sm font-semibold">Your input as another line manager</p>
          <p className="text-xs text-muted-foreground">Seen only by {d.appraisal.manager_name ?? 'the reviewing manager'} and HR, to help them make the review.</p>
        </div>
        {canAdd ? (
          <>
            <RatingPicker value={rating} onChange={setRating} />
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Your view of their work for you this period" />
            <div className="flex justify-end">
              <Button size="sm" loading={add.isPending} onClick={() => add.mutate({ id: d.appraisal.id, rating, comment }, {
                onSuccess: () => toast.success('Your input was saved'), onError: (e) => toast.error('Could not save', { description: errorMessage(e) }) })}>
                {mineExisting ? 'Update my input' : 'Add my input'}
              </Button>
            </div>
          </>
        ) : mineExisting ? <p className="text-sm">“{mineExisting.comment}”</p> : <p className="text-sm text-muted-foreground">This appraisal has been signed off.</p>}
      </Card>
    )
  }
  if (!d.inputs.length) return null
  return (
    <Card className="space-y-3 p-5">
      <p className="text-sm font-semibold">Input from other line managers</p>
      {d.inputs.map((i, k) => (
        <div key={k} className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="mb-1 flex items-center justify-between gap-2"><span className="font-medium">{i.name}</span><RatingDots value={i.rating} /></div>
          <p className="whitespace-pre-wrap">{i.comment}</p>
        </div>
      ))}
    </Card>
  )
}

function SignOffPanel({ d }: { d: AppraisalDetail }) {
  const sign = useSignOff()
  const a = d.appraisal
  const [final, setFinal] = React.useState<number | null>(a.manager_overall)
  const [rec, setRec] = React.useState(a.manager_recommendation ?? '')
  const [comment, setComment] = React.useState('')
  const run = (sendBack: boolean) => {
    if (!sendBack && !final) { toast.error('Choose the final rating'); return }
    if (sendBack && !comment.trim()) { toast.error('Say what the line manager should change'); return }
    sign.mutate({ id: a.id, final, recommendation: rec, comment, sendBack }, {
      onSuccess: () => toast.success(sendBack ? 'Sent back to the line manager' : `Signed off — ${a.employee_name} has been asked to acknowledge it`),
      onError: (e) => toast.error('Could not complete', { description: errorMessage(e) }),
    })
  }
  return (
    <Card className="space-y-4 border-primary/40 p-5">
      <div>
        <p className="font-semibold">Sign-off</p>
        <p className="text-xs text-muted-foreground">Set the final rating and decision. {a.employee_name} sees everything once you sign off.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Final rating</Label><RatingPicker value={final} onChange={setFinal} /></div>
        <div className="space-y-1.5">
          <Label>Decision</Label>
          <Select value={rec || NONE} onValueChange={(v) => setRec(v === NONE ? '' : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {RECOMMENDATIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5"><Label>Comment</Label><Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Shown to the staff member — or, if sending back, to the line manager" /></div>
      <div className="flex flex-wrap justify-end gap-2">
        {a.manager_user_id && <Button variant="outline" onClick={() => run(true)} disabled={sign.isPending}><Undo2 className="h-4 w-4" /> Send back to line manager</Button>}
        <Button onClick={() => run(false)} loading={sign.isPending}><Check className="h-4 w-4" /> Sign off</Button>
      </div>
    </Card>
  )
}

function AcknowledgePanel({ d }: { d: AppraisalDetail }) {
  const ack = useAcknowledge()
  const [agrees, setAgrees] = React.useState<boolean | null>(null)
  const [comment, setComment] = React.useState('')
  const [sign, setSign] = React.useState(true)
  const run = () => {
    if (agrees == null) { toast.error('Say whether you agree'); return }
    if (!agrees && !comment.trim()) { toast.error('Please explain what you disagree with'); return }
    ack.mutate({ id: d.appraisal.id, agrees, comment, withSignature: sign }, {
      onSuccess: () => toast.success('Thank you — your appraisal is complete'),
      onError: (e) => toast.error('Could not acknowledge', { description: errorMessage(e) }),
    })
  }
  return (
    <Card className="space-y-4 border-primary/40 p-5">
      <div>
        <p className="font-semibold">Your acknowledgement</p>
        <p className="text-xs text-muted-foreground">Read the review below, then confirm. Acknowledging means you have read it — you can still disagree.</p>
      </div>
      <div className="grid max-w-md grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <button key={String(v)} type="button" onClick={() => setAgrees(v)}
            className={cn('rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors', agrees === v ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50')}>
            {v ? 'I agree with this appraisal' : 'I don’t agree'}
          </button>
        ))}
      </div>
      <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={agrees === false ? 'What do you disagree with? (required)' : 'Any comment (optional)'} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={sign} onChange={(e) => setSign(e.target.checked)} />
        <PenLine className="h-4 w-4 text-muted-foreground" /> Sign with my e-signature
      </label>
      <div className="flex justify-end"><Button onClick={run} loading={ack.isPending}>Acknowledge</Button></div>
    </Card>
  )
}

/** One appraisal — what you see and can do depends on who you are and the stage. */
export function AppraisalPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeMembership } = useAuth()
  const { data: d, isLoading } = useAppraisal(id)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!d) return <Card className="p-10 text-center text-muted-foreground">This appraisal doesn’t exist or isn’t yours to see.</Card>
  const a = d.appraisal
  const role = d.viewer_role
  const open = d.cycle.status === 'open'
  const selfEditing = role === 'self' && a.status === 'self_review' && open
  const managerEditing = a.status === 'manager_review' && open && (role === 'manager' || (role === 'hr' && !a.manager_user_id))
  const signing = role === 'hr' && a.status === 'sign_off'
  const acknowledging = role === 'self' && a.status === 'acknowledge'
  const waitingNote =
    role === 'self' && a.status === 'manager_review' ? `Submitted — ${a.manager_name ?? 'your line manager'} is reviewing it. You’ll see their ratings once it’s signed off.`
    : role === 'self' && a.status === 'sign_off' ? 'Your line manager has reviewed it — it’s waiting for final sign-off.'
    : role !== 'self' && a.status === 'self_review' ? `${a.employee_name} hasn’t submitted their self-appraisal yet${d.cycle.self_due ? ` (due ${format(new Date(d.cycle.self_due), 'd MMM')})` : ''}.`
    : role === 'manager' && a.status === 'sign_off' ? 'Submitted — waiting for sign-off by HR or the Managing Partner.'
    : null
  const canPrint = role !== 'self' || ['acknowledge', 'completed'].includes(a.status)

  const print = async () => {
    if (!activeMembership) return
    const win = openBlankPrintWindow()
    printAppraisal(d, activeMembership.organization, await getSignatures([a.user_id, a.manager_user_id, a.signed_off_by]), win)
  }

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/hr/appraisals')}><ArrowLeft className="h-4 w-4" /> Appraisals</Button>
      <PageHeader
        title={role === 'self' ? `My appraisal — ${d.cycle.name}` : `${a.employee_name} — ${d.cycle.name}`}
        description={`${[a.job_title, a.department].filter(Boolean).join(' · ')}${a.manager_name ? ` · Line manager: ${a.manager_name}` : ''} · ${format(new Date(d.cycle.period_start), 'd MMM yyyy')} – ${format(new Date(d.cycle.period_end), 'd MMM yyyy')}`}
        actions={canPrint ? <Button variant="outline" onClick={print}><Printer className="h-4 w-4" /> Print / PDF</Button> : undefined}
      />
      <Stepper status={a.status} />
      {!open && a.status !== 'completed' && <Card className="mb-4 p-3 text-sm text-muted-foreground">This appraisal cycle is closed.</Card>}
      {waitingNote && <Card className="mb-4 bg-muted/30 p-4 text-sm">{waitingNote}</Card>}

      <div className="space-y-5">
        {acknowledging && <AcknowledgePanel d={d} />}
        {signing && <SignOffPanel d={d} />}
        {selfEditing ? <ReviewForm d={d} side="self" /> : managerEditing ? <ReviewForm d={d} side="manager" /> : <Summary d={d} />}
        {(role === 'line_manager' || ((role === 'manager' || role === 'hr') && d.inputs.length > 0)) && <InputsPanel d={d} />}
      </div>
    </div>
  )
}
