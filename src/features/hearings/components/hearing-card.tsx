import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { MoreHorizontal, Pencil, Trash2, MapPin, Scale } from 'lucide-react'
import { HEARING_STATUS_META, type HearingRow } from '@/features/hearings/types'
import { isMatterClosed } from '@/features/matters/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'

export function HearingCard({
  h,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  showMatter = true,
}: {
  h: HearingRow
  onEdit: () => void
  onDelete: () => void
  canEdit: boolean
  canDelete: boolean
  showMatter?: boolean
}) {
  const meta = HEARING_STATUS_META[h.status]
  // A closed matter's hearings have no leadership bypass, unlike the
  // matter itself — hearings_update/_delete RLS blocks everyone once
  // matter_is_open() is false, no exceptions. Hide the menu to match,
  // rather than let anyone open it and hit a blocked save.
  const matterClosed = h.matter ? isMatterClosed(h.matter.status) : false
  const showEdit = canEdit && !matterClosed
  const showDelete = canDelete && !matterClosed
  return (
    <Card className="flex items-start gap-4 p-4">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-lg bg-primary/10 py-2 text-primary">
        <span className="text-xs font-semibold uppercase">{format(new Date(h.hearing_at), 'MMM')}</span>
        <span className="font-display text-2xl font-semibold leading-none">{format(new Date(h.hearing_at), 'd')}</span>
        <span className="mt-1 text-[11px] text-muted-foreground">{format(new Date(h.hearing_at), 'HH:mm')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{h.title}</p>
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <Badge variant="outline" className="capitalize">{h.type}</Badge>
        </div>
        {showMatter && h.matter && (
          <Link to={`/matters/${h.matter.id}`} className="text-xs text-primary hover:underline">
            {h.matter.matter_number} — {h.matter.title}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {h.court && <span className="flex items-center gap-1"><Scale className="h-3 w-3" /> {h.court}</span>}
          {h.judge && <span>Hon. {h.judge}</span>}
          {h.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {h.location}</span>}
        </div>
        {h.outcome && <p className="mt-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Outcome:</span> {h.outcome}</p>}
      </div>
      {(showEdit || showDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {showEdit && <DropdownMenuItem onClick={onEdit}><Pencil /> Edit / record outcome</DropdownMenuItem>}
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
