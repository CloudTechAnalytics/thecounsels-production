import * as React from 'react'
import { format } from 'date-fns'
import { Send, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useAddTicketMessage, useTicket, useUpdateTicket } from '@/features/support/hooks/use-support'
import { TICKET_PRIORITIES, TICKET_PRIORITY_META, TICKET_STATUSES, TICKET_STATUS_META, type TicketPerson } from '@/features/support/types'
import type { TicketPriority, TicketStatus } from '@/shared/types/database.types'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const UNASSIGNED = 'unassigned'

export function TicketThreadDialog({
  ticketId,
  onOpenChange,
  platformView = false,
  assignees = [],
}: {
  ticketId: string | null
  onOpenChange: (open: boolean) => void
  /** Platform console: show triage controls (status / priority / assignee). */
  platformView?: boolean
  /** Platform staff who can be assigned (platform view only). */
  assignees?: TicketPerson[]
}) {
  const { userId } = useAuth()
  const { data: ticket, isLoading } = useTicket(ticketId)
  const update = useUpdateTicket()
  const addMessage = useAddTicketMessage()
  const [reply, setReply] = React.useState('')

  React.useEffect(() => {
    if (ticketId) setReply('')
  }, [ticketId])

  const patch = async (p: { status?: TicketStatus; priority?: TicketPriority; assignee_id?: string | null }) => {
    if (!ticket) return
    try {
      await update.mutateAsync({ id: ticket.id, organizationId: ticket.organization_id, patch: p })
    } catch (err) {
      toast.error('Could not update ticket', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const send = async () => {
    if (!ticket || !reply.trim()) return
    try {
      await addMessage.mutateAsync({ ticketId: ticket.id, body: reply })
      setReply('')
    } catch (err) {
      toast.error('Could not send reply', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const isClosed = ticket?.status === 'resolved' || ticket?.status === 'closed'

  return (
    <Dialog open={Boolean(ticketId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {isLoading || !ticket ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
                <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_number}</span>
                {ticket.subject}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <Badge variant={TICKET_STATUS_META[ticket.status].variant}>{TICKET_STATUS_META[ticket.status].label}</Badge>
                <Badge variant={TICKET_PRIORITY_META[ticket.priority].variant}>{TICKET_PRIORITY_META[ticket.priority].label}</Badge>
                {platformView && ticket.organization && <span>· {ticket.organization.name}</span>}
                <span>· opened {format(new Date(ticket.created_at), 'MMM d, yyyy')}</span>
                {ticket.creator && <span>by {ticket.creator.full_name ?? ticket.creator.email}</span>}
              </DialogDescription>
            </DialogHeader>

            {platformView && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Select value={ticket.status} onValueChange={(v) => patch({ status: v as TicketStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{TICKET_STATUS_META[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={ticket.priority} onValueChange={(v) => patch({ priority: v as TicketPriority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{TICKET_PRIORITY_META[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={ticket.assignee_id ?? UNASSIGNED}
                  onValueChange={(v) => patch({ assignee_id: v === UNASSIGNED ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name ?? a.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-muted/30">
              <div className="space-y-4 p-4">
                {ticket.messages.map((m) => {
                  const mine = platformView ? m.from_platform : !m.from_platform
                  return (
                    <div key={m.id} className={cn('flex gap-2.5', mine && 'flex-row-reverse')}>
                      <Avatar className="h-8 w-8 shrink-0">
                        {m.author?.avatar_url && <AvatarImage src={m.author.avatar_url} alt="" />}
                        <AvatarFallback>{m.from_platform ? 'CT' : initialsOf(m.author?.full_name ?? m.author?.email)}</AvatarFallback>
                      </Avatar>
                      <div className={cn('max-w-[75%] rounded-lg px-3 py-2 text-sm', mine ? 'bg-primary/10' : 'bg-card border border-border')}>
                        <p className="mb-0.5 text-xs text-muted-foreground">
                          {m.from_platform ? 'CloudTech Support' : (m.author?.full_name ?? m.author?.email ?? 'User')}
                          {m.author?.id === userId && ' (you)'} · {format(new Date(m.created_at), 'MMM d, HH:mm')}
                        </p>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  )
                })}
                {ticket.messages.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
                )}
              </div>
            </div>

            {isClosed && !platformView ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
                <p className="text-sm text-muted-foreground">This ticket is {TICKET_STATUS_META[ticket.status].label.toLowerCase()}.</p>
                <Button variant="outline" size="sm" loading={update.isPending} onClick={() => patch({ status: 'open' })}>
                  Reopen
                </Button>
              </div>
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  rows={2}
                  className="min-h-0"
                />
                <Button onClick={send} disabled={!reply.trim()} aria-label="Send reply">
                  {addMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            )}

            {!platformView && !isClosed && (
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" loading={update.isPending} onClick={() => patch({ status: 'closed' })}>
                  Close ticket
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
