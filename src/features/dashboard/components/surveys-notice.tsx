import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ClipboardList, EyeOff } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSurveys } from '@/features/surveys/hooks/use-surveys'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'

/** Surveys waiting for this person's answer. Renders nothing when there are none. */
export function SurveysNotice() {
  const { activeOrgId, userId } = useAuth()
  const { data = [] } = useSurveys(activeOrgId, userId)
  const today = format(new Date(), 'yyyy-MM-dd')
  const waiting = data.filter((s) => s.status === 'open' && s.i_am_recipient && !s.my_responded_at && (!s.closes_on || s.closes_on >= today))
  if (waiting.length === 0) return null
  return (
    <Card className="mt-6 overflow-hidden border-primary/30">
      <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-5 py-3">
        <ClipboardList className="h-4 w-4 text-primary" />
        <p className="font-display text-base font-semibold">{waiting.length === 1 ? 'A survey is waiting for you' : `${waiting.length} surveys are waiting for you`}</p>
      </div>
      <ul className="divide-y divide-border">
        {waiting.slice(0, 3).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {s.anonymous && <><EyeOff className="h-3 w-3" /> Anonymous · </>}
                {s.closes_on ? `closes ${format(new Date(s.closes_on), 'd MMM')}` : 'takes a few minutes'}
              </p>
            </div>
            <Button asChild size="sm"><Link to={`/hr/surveys/${s.id}`}>Answer now</Link></Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
