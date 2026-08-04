import * as React from 'react'
import { format, isPast } from 'date-fns'
import { Plus, Gavel, Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useHearings, useDeleteHearing } from '@/features/hearings/hooks/use-hearings'
import { HearingFormDialog } from '@/features/hearings/components/hearing-form-dialog'
import { HearingCard } from '@/features/hearings/components/hearing-card'
import { HEARING_STATUS_META, type HearingRow } from '@/features/hearings/types'
import type { HearingFilters } from '@/features/hearings/services/hearings.service'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'

export function HearingsPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<HearingFilters['status']>('all')
  const { data, isLoading } = useHearings(activeOrgId, { search, status })
  const del = useDeleteHearing(activeOrgId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<HearingRow | null>(null)
  const [toDelete, setToDelete] = React.useState<HearingRow | null>(null)

  const canCreate = has('hearings.create')
  const canEdit = has('hearings.update')
  const canDelete = has('hearings.delete')

  const upcoming = (data ?? []).filter((h) => !isPast(new Date(h.hearing_at)) && h.status === 'scheduled')
  const past = (data ?? []).filter((h) => isPast(new Date(h.hearing_at)) || h.status !== 'scheduled')

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (h: HearingRow) => {
    setEditing(h)
    setFormOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Hearings"
        description="Court dates, mentions, rulings and appearances."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="hearings"
              disabled={!data?.length}
              sheets={() => [{
                name: 'Hearings',
                rows: (data ?? []).map((h) => ({
                  Title: h.title,
                  Matter: h.matter?.matter_number ?? '',
                  Type: h.type,
                  Status: HEARING_STATUS_META[h.status].label,
                  'Date & time': format(new Date(h.hearing_at), 'yyyy-MM-dd HH:mm'),
                  Court: h.court ?? '',
                  Judge: h.judge ?? '',
                  Location: h.location ?? '',
                  Outcome: h.outcome ?? '',
                })),
              }]}
            />
            {canCreate && <Button onClick={openNew}><Plus /> Schedule hearing</Button>}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title, court or judge…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as HearingFilters['status'])}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(HEARING_STATUS_META).map(([v, meta]) => (
              <SelectItem key={v} value={v}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</h2>
              {upcoming.map((h) => (
                <HearingCard key={h.id} h={h} canEdit={canEdit} canDelete={canDelete} onEdit={() => openEdit(h)} onDelete={() => setToDelete(h)} />
              ))}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past &amp; concluded</h2>
              {past.map((h) => (
                <HearingCard key={h.id} h={h} canEdit={canEdit} canDelete={canDelete} onEdit={() => openEdit(h)} onDelete={() => setToDelete(h)} />
              ))}
            </section>
          )}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Gavel className="h-7 w-7" />
          </span>
          <p className="font-display text-lg font-semibold">No hearings scheduled</p>
          <p className="max-w-sm text-sm text-muted-foreground">Schedule court dates and they'll appear here and on the calendar.</p>
          {canCreate && <Button onClick={openNew} className="mt-1"><Plus /> Schedule hearing</Button>}
        </Card>
      )}

      <HearingFormDialog hearing={editing} open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete hearing"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This removes <strong>{toDelete?.title}</strong> from the calendar.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync({ id: toDelete.id, title: toDelete.title })
            toast.success('Hearing deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
