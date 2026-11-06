import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Plus, ClipboardList, ChevronRight, CheckCircle2, EyeOff } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { surveyState, useSurveys, type SurveyWithMine } from '@/features/surveys/hooks/use-surveys'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'

const isWaiting = (s: SurveyWithMine) =>
  s.status === 'open' && s.i_am_recipient && !s.my_responded_at && (!s.closes_on || s.closes_on >= format(new Date(), 'yyyy-MM-dd'))

function Row({ s, manager, onOpen }: { s: SurveyWithMine; manager: boolean; onOpen: () => void }) {
  const st = surveyState(s)
  const rate = s.recipient_count ? Math.round((s.response_count / s.recipient_count) * 100) : 0
  return (
    <li>
      <button onClick={onOpen} className="flex w-full flex-wrap items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium">
            {s.title}
            {s.anonymous && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Anonymous" />}
          </p>
          <p className="text-xs text-muted-foreground">
            {s.status === 'draft' ? `Draft · created ${format(new Date(s.created_at), 'd MMM yyyy')}` : `Sent ${s.sent_at ? format(new Date(s.sent_at), 'd MMM yyyy') : ''}`}
            {s.closes_on && s.status === 'open' && ` · closes ${format(new Date(s.closes_on), 'd MMM')}`}
          </p>
        </div>
        {manager && s.status !== 'draft' && (
          <div className="w-40">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{s.response_count} of {s.recipient_count}</span><span>{rate}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} /></div>
          </div>
        )}
        {!manager && s.my_responded_at && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Answered</span>}
        <Badge variant={st.variant}>{st.label}</Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </li>
  )
}

/** Surveys & questionnaires: what's waiting for me, and (for HR) every survey. */
export function SurveysPage() {
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const manager = has('surveys.manage')
  const { data: surveys = [], isLoading } = useSurveys(activeOrgId, userId)
  const waiting = surveys.filter(isWaiting)
  const rest = surveys.filter((s) => !isWaiting(s) && (manager || s.i_am_recipient))

  return (
    <div>
      <PageHeader
        title="Surveys"
        description={manager ? 'Ask staff questions — anonymously or by name — and see the answers as they come in.' : 'Questionnaires the firm has asked you to answer.'}
        actions={manager ? <Button onClick={() => navigate('/hr/surveys/new')}><Plus className="h-4 w-4" /> New survey</Button> : undefined}
      />
      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <div className="space-y-5">
          {waiting.length > 0 && (
            <Card className="overflow-hidden border-primary/40">
              <p className="border-b border-border bg-primary/5 px-4 py-2 text-sm font-semibold">Waiting for your answer</p>
              <ul className="divide-y divide-border">
                {waiting.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.anonymous ? 'Anonymous — your name is not attached to your answers' : 'Your name is recorded with your answers'}
                        {s.closes_on && ` · closes ${format(new Date(s.closes_on), 'd MMM')}`}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/hr/surveys/${s.id}`)}>Answer now</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card className="overflow-hidden">
            {rest.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                <ClipboardList className="mx-auto mb-2 h-6 w-6" />
                {manager ? 'No surveys yet. Start one from a ready-made template or from scratch.' : waiting.length ? 'Nothing else here.' : 'No surveys for you right now.'}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rest.map((s) => <Row key={s.id} s={s} manager={manager} onOpen={() => navigate(s.status === 'draft' ? `/hr/surveys/${s.id}/edit` : `/hr/surveys/${s.id}`)} />)}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
