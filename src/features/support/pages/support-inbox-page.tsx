import { useNavigate, useParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ArrowLeft, LifeBuoy, Megaphone } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useTickets } from '@/features/support/hooks/use-support'
import { TicketThread } from '@/features/support/components/ticket-thread'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'

/** "Messages from The Counsel" for anyone in a firm — the list, or one
 * conversation as a chat. Deliberately outside the subscription gate so a
 * firm whose trial has ended can still read and answer us. */
export function SupportInboxPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: tickets = [], isLoading } = useTickets({ organizationId: activeOrgId ?? undefined })

  if (id) {
    return (
      <div className="w-full max-w-4xl">
        <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/support')}><ArrowLeft className="h-4 w-4" /> All messages</Button>
        <Card className="p-5"><TicketThread ticketId={id} tall /></Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl">
      <PageHeader title="Messages from The Counsel" description="Conversations with The Counsel team — reply here and we'll see it straight away." />
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => {
              const ours = t.kind === 'platform_message'
              const needsYou = ours && t.status === 'waiting'
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate(`/support/${t.id}`)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/50">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', ours ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      {ours ? <Megaphone className="h-4 w-4" /> : <LifeBuoy className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', needsYou ? 'font-semibold' : 'font-medium')}>{t.subject}</span>
                      <span className="block text-xs text-muted-foreground">
                        {ours ? 'From The Counsel' : `Support ticket ${t.ticket_number ?? ''}`} · {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                      </span>
                    </span>
                    {needsYou && <Badge>New</Badge>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
