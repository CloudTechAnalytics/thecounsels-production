import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { LifeBuoy, Plus } from 'lucide-react'
import { useTickets } from '@/features/support/hooks/use-support'
import { NewTicketDialog } from '@/features/support/components/new-ticket-dialog'
import { TicketThreadDialog } from '@/features/support/components/ticket-thread-dialog'
import { TICKET_PRIORITY_META, TICKET_STATUS_META } from '@/features/support/types'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'

/** Firm Settings → Support: raise tickets with CloudTech and follow the thread. */
export function FirmSupportPanel({ organizationId }: { organizationId: string }) {
  const { data: tickets, isLoading } = useTickets({ organizationId })
  const [createOpen, setCreateOpen] = React.useState(false)
  const [openTicketId, setOpenTicketId] = React.useState<string | null>(null)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Having trouble? Raise a ticket and the CloudTech support team will reply here.
        </p>
        <Button onClick={() => setCreateOpen(true)}><Plus /> New ticket</Button>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : tickets && tickets.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenTicketId(t.id)}>
                  <TableCell>
                    <p className="text-sm font-medium">{t.subject}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.ticket_number}</p>
                  </TableCell>
                  <TableCell><Badge variant={TICKET_PRIORITY_META[t.priority].variant}>{TICKET_PRIORITY_META[t.priority].label}</Badge></TableCell>
                  <TableCell><Badge variant={TICKET_STATUS_META[t.status].variant}>{TICKET_STATUS_META[t.status].label}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center">
            <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No support tickets yet.</p>
          </div>
        )}
      </Card>

      <NewTicketDialog open={createOpen} onOpenChange={setCreateOpen} organizationId={organizationId} />
      <TicketThreadDialog ticketId={openTicketId} onOpenChange={(o) => !o && setOpenTicketId(null)} />
    </div>
  )
}
