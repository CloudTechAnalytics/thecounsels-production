import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { Megaphone, Plus, Pin, Paperclip, CheckCircle2, Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useCirculars, type CircularForMe } from '@/features/hr/hooks/use-circulars'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

/** What the signed-in user still has to do with a circular. */
export function circularState(c: CircularForMe): { label: string; tone: 'warning' | 'default' | 'success' | 'muted' } | null {
  if (!c.mine) return null
  if (c.requires_ack && !c.mine.acknowledged_at) return { label: c.ack_due && c.ack_due < format(new Date(), 'yyyy-MM-dd') ? 'Acknowledgement overdue' : 'Please acknowledge', tone: 'warning' }
  if (!c.mine.read_at) return { label: 'Unread', tone: 'default' }
  if (c.requires_ack) return { label: 'Acknowledged', tone: 'success' }
  return { label: 'Read', tone: 'muted' }
}

function Row({ c, manage }: { c: CircularForMe; manage: boolean }) {
  const navigate = useNavigate()
  const st = circularState(c)
  const done = c.requires_ack ? c.acked : c.read
  const pct = c.recipient_count ? Math.round((done / c.recipient_count) * 100) : 0
  const unread = st && (st.tone === 'warning' || st.tone === 'default')
  return (
    <button onClick={() => navigate(`/hr/announcements/${c.id}`)} className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40">
      <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', unread ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary')}>
        {c.pinned ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('truncate', unread ? 'font-semibold' : 'font-medium')}>{c.title}</span>
          {c.category && <Badge variant="secondary" className="font-normal">{c.category}</Badge>}
          {c.attachment_name && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {c.reference_no} · {format(new Date(c.created_at), 'd MMM yyyy')}
          {c.requires_ack && c.ack_due ? ` · acknowledge by ${format(new Date(c.ack_due + 'T00:00:00'), 'd MMM')}` : ''}
        </span>
        <span className="mt-1 line-clamp-1 block text-sm text-muted-foreground">{c.body}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        {st && <Badge variant={st.tone}>{st.label}</Badge>}
        {manage && (
          <span className="w-36 text-right">
            <span className="block text-xs text-muted-foreground">{done} of {c.recipient_count} {c.requires_ack ? 'acknowledged' : 'read'}</span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
          </span>
        )}
      </span>
    </button>
  )
}

/** Circulars: memos and notices staff must read (and, when required, acknowledge). */
export function CircularsPage() {
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('hr_announcements.manage')
  const { data = [], isLoading } = useCirculars(activeOrgId, userId)
  const [tab, setTab] = React.useState<'mine' | 'all'>('mine')
  const [search, setSearch] = React.useState('')

  const mine = data.filter((c) => c.mine)
  const toDo = mine.filter((c) => { const s = circularState(c); return s && (s.tone === 'warning' || s.tone === 'default') })
  const list = (tab === 'mine' ? mine : data)
    .filter((c) => !search || `${c.title} ${c.reference_no} ${c.category ?? ''} ${c.body}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at))

  return (
    <div>
      <PageHeader
        title="Circulars"
        description="Memos, policies and notices. Open each one; when it asks, confirm you've read and understood it."
        actions={canManage ? <Button onClick={() => navigate('/hr/announcements/new')}><Plus className="h-4 w-4" /> New circular</Button> : undefined}
      />

      {toDo.length > 0 && (
        <Card className="mb-5 flex items-center gap-3 border-warning/40 bg-warning/5 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-warning" />
          <p className="text-sm"><span className="font-semibold">{toDo.length} circular{toDo.length === 1 ? '' : 's'}</span> waiting for you to read{toDo.some((c) => c.requires_ack) ? ' or acknowledge' : ''}.</p>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {canManage ? (
          <div className="flex rounded-lg border border-border p-0.5">
            {([['mine', 'Sent to me'], ['all', 'All circulars']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={cn('rounded-md px-3 py-1 text-sm font-medium transition-colors', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{l}</button>
            ))}
          </div>
        ) : <span />}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search circulars" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Megaphone className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No circulars {tab === 'mine' ? 'for you ' : ''}yet</p>
            {canManage && <p className="text-sm text-muted-foreground">Send one to the whole firm, a branch, a department, a role or chosen people.</p>}
          </div>
        ) : (
          <div className="divide-y divide-border">{list.map((c) => <Row key={c.id} c={c} manage={canManage && tab === 'all'} />)}</div>
        )}
      </Card>
      {mine.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Last circular {formatDistanceToNow(new Date(mine[0].created_at), { addSuffix: true })}.</p>}
    </div>
  )
}
