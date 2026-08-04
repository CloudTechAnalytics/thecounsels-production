import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, MoreHorizontal, Pencil, Copy, Unlock, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useTimeEntries, useDeleteTimeEntry, useReopenTimeEntry } from '@/features/billing/hooks/use-billing'
import { TimeEntryDialog } from '@/features/billing/components/log-dialogs'
import { billingService, type TimeEntryFilters } from '@/features/billing/services/billing.service'
import { TIME_ENTRY_STATUS_META, LOCKED_TIME_ENTRY_STATUSES, timeAmount, type TimeEntryRow } from '@/features/billing/types'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { formatNaira } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

const PAGE_SIZE = 25

export function TimeEntriesTab() {
  const { activeOrgId, activeMembership } = useAuth()
  const { data: matters } = useMatters(activeOrgId, {})
  const { data: clients } = useClients(activeOrgId, {})

  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<NonNullable<TimeEntryFilters['status']>>('all')
  const [matterId, setMatterId] = React.useState<NonNullable<TimeEntryFilters['matterId']>>('all')
  const [clientId, setClientId] = React.useState<NonNullable<TimeEntryFilters['clientId']>>('all')
  const [billable, setBillable] = React.useState<NonNullable<TimeEntryFilters['billable']>>('all')
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [page, setPage] = React.useState(1)

  const filters: TimeEntryFilters = {
    search: search || undefined,
    status,
    matterId,
    clientId,
    billable,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }
  const { data, isLoading } = useTimeEntries(activeOrgId, filters, page, PAGE_SIZE)
  const del = useDeleteTimeEntry(activeOrgId)
  const reopen = useReopenTimeEntry(activeOrgId)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TimeEntryRow | null>(null)
  const [duplicating, setDuplicating] = React.useState<TimeEntryRow | null>(null)
  const [toDelete, setToDelete] = React.useState<TimeEntryRow | null>(null)

  const isPartner = (activeMembership?.role.rank ?? 999) <= 20
  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openEdit = (row: TimeEntryRow) => { setEditing(row); setDuplicating(null); setDialogOpen(true) }
  const openDuplicate = (row: TimeEntryRow) => { setEditing(null); setDuplicating(row); setDialogOpen(true) }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search description…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1) }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(TIME_ENTRY_STATUS_META) as (keyof typeof TIME_ENTRY_STATUS_META)[]).map((s) => (
                <SelectItem key={s} value={s}>{TIME_ENTRY_STATUS_META[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={matterId} onValueChange={(v) => { setMatterId(v); setPage(1) }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All matters" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All matters</SelectItem>
              {matters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setPage(1) }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All clients" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={billable} onValueChange={(v) => { setBillable(v as typeof billable); setPage(1) }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Billable & non</SelectItem>
              <SelectItem value="yes">Billable only</SelectItem>
              <SelectItem value="no">Non-billable only</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-36" aria-label="From date" />
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-36" aria-label="To date" />
        </div>
        <ExportButton
          filename="time-entries"
          disabled={total === 0}
          sheets={async () => {
            const full = await billingService.listTimeEntries(activeOrgId!, filters)
            return [{
              name: 'Time entries',
              rows: full.rows.map((t) => ({
                Date: t.work_date,
                Description: t.description,
                Matter: t.matter?.matter_number ?? '',
                'Logged by': t.user?.full_name ?? '',
                Status: TIME_ENTRY_STATUS_META[t.status].label,
                Hours: Number((t.minutes / 60).toFixed(2)),
                Rate: Number(t.rate),
                Amount: timeAmount(t.minutes, Number(t.rate)),
                Billable: t.billable ? 'Yes' : 'No',
                'Created by': t.created_by_profile?.full_name ?? '',
                'Created date': t.created_at,
                'Modified by': t.updated_by_profile?.full_name ?? '',
                'Modified date': t.updated_at,
              })),
            }]
          }}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Matter</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logged by</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const locked = LOCKED_TIME_ENTRY_STATUSES.includes(t.status)
                  const meta = TIME_ENTRY_STATUS_META[t.status]
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">
                        {t.description}
                        {!t.billable && <Badge variant="muted" className="ml-2">Non-billable</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.matter ? (
                          <Link to={`/matters/${t.matter.id}`} className="text-primary hover:underline">
                            {t.matter.matter_number} — {t.matter.title}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{format(new Date(t.work_date), 'MMM d, yyyy')}</TableCell>
                      <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{t.user?.full_name ?? '—'}</TableCell>
                      <TableCell className="text-right text-sm">{(t.minutes / 60).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatNaira(timeAmount(t.minutes, Number(t.rate)))}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled={locked && !isPartner} onClick={() => openEdit(t)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDuplicate(t)}>
                              <Copy /> Duplicate
                            </DropdownMenuItem>
                            {locked && isPartner && (
                              <DropdownMenuItem onClick={() => reopen.mutate(t.id)}>
                                <Unlock /> Reopen
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={locked && !isPartner}
                              onClick={() => setToDelete(t)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages} ({total} entries)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">No time entries match your filters.</p>
        )}
      </Card>

      <TimeEntryDialog entry={editing} duplicateFrom={duplicating} open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete time entry"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={
          toDelete && LOCKED_TIME_ENTRY_STATUSES.includes(toDelete.status)
            ? 'This entry has already been invoiced — deleting it won’t change the issued invoice, only remove this record.'
            : 'This removes the entry permanently.'
        }
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync(toDelete.id)
            toast.success('Time entry deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
