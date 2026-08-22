import * as React from 'react'
import { format, isPast } from 'date-fns'
import { Plus, CalendarClock, Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useAppointments, useDeleteAppointment } from '@/features/appointments/hooks/use-appointments'
import { AppointmentFormDialog } from '@/features/appointments/components/appointment-form-dialog'
import { useBranchScope } from '@/features/dashboard/hooks/use-branch-scope'
import { BranchSelector } from '@/features/dashboard/components/branch-selector'
import { AppointmentCard } from '@/features/appointments/components/appointment-card'
import { APPOINTMENT_STATUS_META, type AppointmentRow } from '@/features/appointments/types'
import type { AppointmentFilters } from '@/features/appointments/services/appointments.service'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { friendlyErrorMessage } from '@/shared/lib/errors'

export function AppointmentsPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<AppointmentFilters['status']>('all')
  const branchScope = useBranchScope()
  const { data, isLoading } = useAppointments(activeOrgId, { search, status, branchId: branchScope.selectedBranchId })
  const del = useDeleteAppointment(activeOrgId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AppointmentRow | null>(null)
  const [toDelete, setToDelete] = React.useState<AppointmentRow | null>(null)

  const canCreate = has('appointments.create')
  const canEdit = has('appointments.update')
  const canDelete = has('appointments.delete')

  const upcoming = (data ?? []).filter((a) => !isPast(new Date(a.appointment_at)) && a.status === 'scheduled')
  const past = (data ?? []).filter((a) => isPast(new Date(a.appointment_at)) || a.status !== 'scheduled')

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (a: AppointmentRow) => {
    setEditing(a)
    setFormOpen(true)
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Client meetings, consultations and other non-court appointments."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="appointments"
              disabled={!data?.length}
              sheets={() => [{
                name: 'Appointments',
                rows: (data ?? []).map((a) => ({
                  Title: a.title,
                  Client: a.client?.display_name ?? '',
                  Matter: a.matter?.matter_number ?? '',
                  Status: APPOINTMENT_STATUS_META[a.status].label,
                  'Date & time': format(new Date(a.appointment_at), 'yyyy-MM-dd HH:mm'),
                  'Assigned to': a.assigned_to?.full_name ?? '',
                  Location: a.location ?? '',
                })),
              }]}
            />
            {canCreate && <Button onClick={openNew}><Plus /> Schedule appointment</Button>}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or location…" className="pl-9" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as AppointmentFilters['status'])}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(APPOINTMENT_STATUS_META).map(([v, meta]) => (
              <SelectItem key={v} value={v}>{meta.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {branchScope.canSelect && (
          <BranchSelector options={branchScope.options} value={branchScope.selectedBranchId} onChange={branchScope.setSelectedBranchId} />
        )}
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
              {upcoming.map((a) => (
                <AppointmentCard key={a.id} a={a} canEdit={canEdit} canDelete={canDelete} onEdit={() => openEdit(a)} onDelete={() => setToDelete(a)} />
              ))}
            </section>
          )}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Past &amp; concluded</h2>
              {past.map((a) => (
                <AppointmentCard key={a.id} a={a} canEdit={canEdit} canDelete={canDelete} onEdit={() => openEdit(a)} onDelete={() => setToDelete(a)} />
              ))}
            </section>
          )}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <CalendarClock className="h-7 w-7" />
          </span>
          <p className="font-display text-lg font-semibold">No appointments scheduled</p>
          <p className="max-w-sm text-sm text-muted-foreground">Schedule a client meeting or consultation and it'll appear here and on the calendar.</p>
          {canCreate && <Button onClick={openNew} className="mt-1"><Plus /> Schedule appointment</Button>}
        </Card>
      )}

      <AppointmentFormDialog appointment={editing} open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete appointment"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This removes <strong>{toDelete?.title}</strong> from the calendar.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync({ id: toDelete.id, title: toDelete.title })
            toast.success('Appointment deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: friendlyErrorMessage(err) })
          }
        }}
      />
    </div>
  )
}
