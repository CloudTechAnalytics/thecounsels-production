import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { LifeBuoy, Inbox, Timer, CheckCircle2, AlertTriangle, Plus, Search } from 'lucide-react'
import { useTickets } from '@/features/support/hooks/use-support'
import { usePlatformOrganizations, usePlatformUsers } from '@/features/platform/hooks/use-platform'
import { TicketThreadDialog } from '@/features/support/components/ticket-thread-dialog'
import { NewTicketDialog } from '@/features/support/components/new-ticket-dialog'
import { OPEN_TICKET_STATUSES, TICKET_PRIORITY_META, TICKET_STATUS_META, TICKET_STATUSES } from '@/features/support/types'
import type { TicketStatus } from '@/shared/types/database.types'
import { KpiCard } from '@/features/platform/components/kpi-card'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'

export function SupportTicketsPage() {
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<TicketStatus | 'all'>('all')
  const { data: tickets, isLoading } = useTickets({ search, status })
  const { data: orgs } = usePlatformOrganizations()
  const { data: platformUsers } = usePlatformUsers()
  const [openTicketId, setOpenTicketId] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const all = tickets ?? []
  const open = all.filter((t) => OPEN_TICKET_STATUSES.includes(t.status))
  const urgent = open.filter((t) => t.priority === 'urgent' || t.priority === 'high')
  const unassigned = open.filter((t) => !t.assignee_id)
  const resolved30d = all.filter(
    (t) => t.resolved_at && Date.now() - new Date(t.resolved_at).getTime() < 30 * 86400000,
  )

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        description="Issues raised by law firms — triage, assign and resolve."
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> New ticket</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Open" value={open.length} hint="Awaiting resolution" icon={Inbox} loading={isLoading} />
        <KpiCard label="High priority" value={urgent.length} hint="Urgent or high, still open" icon={AlertTriangle} loading={isLoading} />
        <KpiCard label="Unassigned" value={unassigned.length} hint="No engineer assigned yet" icon={Timer} loading={isLoading} />
        <KpiCard label="Resolved (30d)" value={resolved30d.length} hint="Closed in the last 30 days" icon={CheckCircle2} loading={isLoading} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by subject or ticket number…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus | 'all')}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{TICKET_STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : all.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Last activity</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {all.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenTicketId(t.id)}>
                  <TableCell>
                    <p className="text-sm font-medium">{t.subject}</p>
                    <p className="font-mono text-xs text-muted-foreground">{t.ticket_number}</p>
                  </TableCell>
                  <TableCell className="text-sm">{t.organization?.name ?? '—'}</TableCell>
                  <TableCell><Badge variant={TICKET_PRIORITY_META[t.priority].variant}>{TICKET_PRIORITY_META[t.priority].label}</Badge></TableCell>
                  <TableCell><Badge variant={TICKET_STATUS_META[t.status].variant}>{TICKET_STATUS_META[t.status].label}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.assignee ? (t.assignee.full_name ?? t.assignee.email) : 'Unassigned'}</TableCell>
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
            <p className="text-sm text-muted-foreground">
              {search || status !== 'all' ? 'No tickets match your filters.' : 'No support tickets yet. Firms raise them from Firm Settings → Support.'}
            </p>
          </div>
        )}
      </Card>

      <TicketThreadDialog
        ticketId={openTicketId}
        onOpenChange={(o) => !o && setOpenTicketId(null)}
        platformView
        assignees={platformUsers ?? []}
      />
      <NewTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        organizations={(orgs ?? []).map((o) => ({ id: o.id, name: o.name }))}
      />
    </div>
  )
}
