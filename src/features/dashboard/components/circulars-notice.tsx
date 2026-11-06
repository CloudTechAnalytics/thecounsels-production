import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Megaphone, Pin } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useCirculars } from '@/features/hr/hooks/use-circulars'
import { circularState } from '@/features/hr/pages/circulars-page'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'

/** Notice board: circulars this person still has to open or acknowledge.
 * Renders nothing when they're all caught up. */
export function CircularsNotice() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const { data = [] } = useCirculars(has('hr_announcements.view') ? activeOrgId : null, userId)
  const waiting = data
    .filter((c) => { const s = circularState(c); return s && (s.tone === 'warning' || s.tone === 'default') })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))
  if (waiting.length === 0) return null
  return (
    <Card className="mt-6 overflow-hidden border-primary/30">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/5 px-5 py-3">
        <p className="flex items-center gap-2 font-display text-base font-semibold"><Megaphone className="h-4 w-4 text-primary" /> Notice board</p>
        <Link to="/hr/announcements" className="text-xs text-primary hover:underline">All circulars</Link>
      </div>
      <ul className="divide-y divide-border">
        {waiting.slice(0, 4).map((c) => {
          const st = circularState(c)!
          return (
            <li key={c.id}>
              <Link to={`/hr/announcements/${c.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                {c.pinned ? <Pin className="h-4 w-4 shrink-0 text-primary" /> : <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.reference_no} · {format(new Date(c.created_at), 'd MMM')}{c.category ? ` · ${c.category}` : ''}</span>
                </span>
                <Badge variant={st.tone}>{st.label}</Badge>
              </Link>
            </li>
          )
        })}
      </ul>
      {waiting.length > 4 && <p className="px-5 py-2 text-xs text-muted-foreground">+{waiting.length - 4} more</p>}
    </Card>
  )
}
