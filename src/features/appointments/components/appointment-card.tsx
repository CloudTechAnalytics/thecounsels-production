import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { MoreHorizontal, Pencil, Trash2, MapPin, User } from 'lucide-react'
import { APPOINTMENT_STATUS_META, APPOINTMENT_STATUSES, type AppointmentRow } from '@/features/appointments/types'
import { isMatterClosed } from '@/features/matters/types'
import { useSetAppointmentStatus } from '@/features/appointments/hooks/use-appointments'
import { useAuth } from '@/features/auth/context/auth-provider'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { StatusBadgeMenu } from '@/shared/components/status-badge-menu'
import { initialsOf } from '@/shared/lib/format'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'

export function AppointmentCard({
  a,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  a: AppointmentRow
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
  canDelete: boolean
}) {
  const { activeOrgId } = useAuth()
  const setStatus = useSetAppointmentStatus(activeOrgId)
  // Same convention as hearings — no leadership bypass once the linked
  // matter is closed, RLS blocks everyone, hide the menu to match.
  const matterClosed = a.matter ? isMatterClosed(a.matter.status) : false
  const showEdit = canEdit && !matterClosed
  const showDelete = canDelete && !matterClosed
  return (
    <Card className="flex items-start gap-4 p-4">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-primary/10 py-2 text-primary">
        <span className="text-xs font-semibold uppercase">{format(new Date(a.appointment_at), 'MMM')}</span>
        <span className="font-display text-2xl font-semibold leading-none">{format(new Date(a.appointment_at), 'd')}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">{format(new Date(a.appointment_at), 'HH:mm')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{a.title}</p>
          <StatusBadgeMenu
            value={a.status}
            options={APPOINTMENT_STATUSES}
            meta={APPOINTMENT_STATUS_META}
            disabled={!showEdit}
            onChange={(status) => setStatus.mutate({ id: a.id, status, title: a.title })}
          />
        </div>
        {a.client && <p className="text-xs text-muted-foreground">for {a.client.display_name}</p>}
        {a.matter && (
          <Link to={`/matters/${a.matter.id}`} className="text-xs text-primary hover:underline">
            {a.matter.matter_number} — {a.matter.title}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {a.assigned_to && (
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/12 text-[9px] font-semibold text-primary">
                {initialsOf(a.assigned_to.full_name, 'U')}
              </span>
              {a.assigned_to.full_name}
            </span>
          )}
          {a.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.location}</span>}
          {!a.assigned_to && <span className="flex items-center gap-1"><User className="h-3 w-3" /> Unassigned</span>}
        </div>
        {a.notes && <p className="mt-2 text-xs text-muted-foreground">{a.notes}</p>}
      </div>
      {(showEdit || showDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showEdit && <DropdownMenuItem onClick={onEdit}><Pencil /> Edit</DropdownMenuItem>}
            {showDelete && (
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </Card>
  )
}
