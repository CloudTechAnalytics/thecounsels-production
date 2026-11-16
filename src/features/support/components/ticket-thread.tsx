import * as React from 'react'
import { format } from 'date-fns'
import { Send, Loader2, MailCheck, Megaphone } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useAddTicketMessage, useFirmRecipients, useLiveTicket, useTicket, useUpdateTicket } from '@/features/support/hooks/use-support'
import { TICKET_PRIORITIES, TICKET_PRIORITY_META, TICKET_STATUSES, TICKET_STATUS_META, type TicketPerson } from '@/features/support/types'
import type { TicketPriority, TicketStatus } from '@/shared/types/database.types'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const UNASSIGNED = 'unassigned'

/** One conversation between a firm and The Counsel, as a chat. Used full-page
 * (firm: /support/:id, platform: /platform/conversations/:id) and inside the
 * Firm Settings → Support pop-up. */
export function TicketThread({
  ticketId,
  platformView = false,
  assignees = [],
  tall = false,
}: {
  ticketId: string
  /** Platform console: show triage controls (status / priority / assignee). */
  platformView?: boolean
  assignees?: TicketPerson[]
  /** Full-page layout: a taller message area. */
  tall?: boolean
}) {
  const { userId } = useAuth()
  const { data: ticket, isLoading } = useTicket(ticketId)
  useLiveTicket(ticketId)
  const update = useUpdateTicket()
  const addMessage = useAddTicketMessage()
  const [reply, setReply] = React.useState('')
  const isPlatformMsg = ticket?.kind === 'platform_message'
  const { data: people = [] } = useFirmRecipients(platformView && isPlatformMsg ? ticket?.organization_id : undefined)
  const endRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setReply('') }, [ticketId])
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [ticket?.messages.length])

  const patch = async (p: { status?: TicketStatus; priority?: TicketPriority; assignee_id?: string | null }) => {
    if (!ticket) return
    try {
      await update.mutateAsync({ id: ticket.id, organizationId: ticket.organization_id, patch: p })
    } catch (err) {
      toast.error('Could not update', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const send = async () => {
    if (!ticket || !reply.trim()) return
    try {
      const email = await addMessage.mutateAsync({ ticketId: ticket.id, body: reply })
      setReply('')
      if (isPlatformMsg && email && !email.skipped) {
        if (email.ok) toast.success(platformView ? `Sent, and emailed to ${email.sent?.length ?? 0}` : 'Sent')
        else if (platformView) toast.warning('Sent in the app, but some emails failed', { description: email.failed?.map((f) => f.to).join(', ') || email.error })
      }
    } catch (err) {
      toast.error('Could not send', { description: err instanceof Error ? err.message : undefined })
    }
  }

  if (isLoading || !ticket) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const isClosed = ticket.status === 'resolved' || ticket.status === 'closed'
  const toNames = isPlatformMsg
    ? [...people.filter((p) => ticket.recipient_user_ids.includes(p.user_id)).map((p) => p.full_name ?? p.email), ...ticket.extra_emails]
    : []

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {isPlatformMsg && <Megaphone className="h-4 w-4 text-primary" />}
          {!isPlatformMsg && <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_number}</span>}
          {ticket.subject}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {platformView || !isPlatformMsg
            ? <Badge variant={TICKET_STATUS_META[ticket.status].variant}>{isPlatformMsg && ticket.status === 'open' ? 'Firm replied' : isPlatformMsg && ticket.status === 'waiting' ? 'Waiting for the firm' : TICKET_STATUS_META[ticket.status].label}</Badge>
            : <Badge variant="outline">From The Counsel</Badge>}
          {!isPlatformMsg && <Badge variant={TICKET_PRIORITY_META[ticket.priority].variant}>{TICKET_PRIORITY_META[ticket.priority].label}</Badge>}
          {platformView && ticket.organization && <span>· {ticket.organization.name}</span>}
          <span>· started {format(new Date(ticket.created_at), 'd MMM yyyy')}</span>
          {!isPlatformMsg && ticket.creator && <span>by {ticket.creator.full_name ?? ticket.creator.email}</span>}
        </div>
        {platformView && isPlatformMsg && toNames.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">To: {toNames.join(', ')}</p>
        )}
      </div>

      {platformView && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={ticket.status} onValueChange={(v) => patch({ status: v as TicketStatus })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{TICKET_STATUS_META[s].label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ticket.priority} onValueChange={(v) => patch({ priority: v as TicketPriority })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TICKET_PRIORITY_META[p].label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={ticket.assignee_id ?? UNASSIGNED} onValueChange={(v) => patch({ assignee_id: v === UNASSIGNED ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {assignees.map((a) => <SelectItem key={a.id} value={a.id}>{a.full_name ?? a.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className={cn('overflow-y-auto rounded-lg border border-border bg-muted/30', tall ? 'max-h-[60vh] min-h-[16rem]' : 'max-h-80')}>
        <div className="space-y-4 p-4">
          {ticket.messages.map((m) => {
            const mine = platformView ? m.from_platform : !m.from_platform
            return (
              <div key={m.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
                <Avatar className="h-8 w-8 shrink-0">
                  {!m.from_platform && m.author?.avatar_url && <AvatarImage src={m.author.avatar_url} alt="" />}
                  <AvatarFallback className={m.from_platform ? 'bg-primary text-primary-foreground' : undefined}>
                    {m.from_platform ? 'C' : initialsOf(m.author?.full_name ?? m.author?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn('max-w-[78%] rounded-lg px-3 py-2 text-sm', mine ? 'bg-primary/10' : 'border border-border bg-card')}>
                  <p className="mb-0.5 text-xs text-muted-foreground">
                    {m.from_platform
                      ? (platformView ? `${m.author?.full_name ?? 'The Counsel'} (The Counsel)` : isPlatformMsg ? (m.author?.full_name ? `${m.author.full_name}, The Counsel` : 'The Counsel') : 'CloudTech Support')
                      : (m.author?.full_name ?? m.author?.email ?? 'User')}
                    {m.author?.id === userId && ' (you)'} · {format(new Date(m.created_at), 'd MMM, HH:mm')}
                    {platformView && isPlatformMsg && m.emailed_at && <MailCheck className="ml-1 inline h-3.5 w-3.5 text-success" aria-label="Emailed" />}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              </div>
            )
          })}
          {ticket.messages.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>}
          <div ref={endRef} />
        </div>
      </div>

      {isClosed && !platformView ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm text-muted-foreground">This conversation is {TICKET_STATUS_META[ticket.status].label.toLowerCase()}.</p>
          <Button variant="outline" size="sm" loading={update.isPending} onClick={() => patch({ status: 'open' })}>Reopen</Button>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
            placeholder={platformView && isPlatformMsg ? 'Write to the firm… (they get it by email too)' : 'Write a reply…'}
            rows={tall ? 3 : 2}
            className="min-h-0"
          />
          <Button onClick={send} disabled={!reply.trim() || addMessage.isPending} aria-label="Send">
            {addMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {!platformView && !isClosed && !isPlatformMsg && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" loading={update.isPending} onClick={() => patch({ status: 'closed' })}>Close ticket</Button>
        </div>
      )}
    </div>
  )
}
