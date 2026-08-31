import { MoreHorizontal, Pencil, Star, Ban, RotateCcw, Trash2, Users2, MapPin } from 'lucide-react'
import type { BranchWithStats } from '@/features/branches/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'

export function BranchCard({
  branch,
  canManage,
  onEdit,
  onSetHeadOffice,
  onToggleActive,
  onViewMembers,
  onDelete,
}: {
  branch: BranchWithStats
  canManage: boolean
  onEdit: () => void
  onSetHeadOffice: () => void
  onToggleActive: () => void
  onViewMembers: () => void
  onDelete: () => void
}) {
  const location = [branch.city, branch.country].filter(Boolean).join(', ')
  return (
    <Card className="flex items-start gap-4 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <MapPin className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{branch.name}</p>
          {branch.code && <Badge variant="secondary">{branch.code}</Badge>}
          {branch.is_head_office && <Badge variant="default">Head Office</Badge>}
          {!branch.is_active && <Badge variant="muted">Inactive</Badge>}
        </div>
        {location && <p className="text-xs text-muted-foreground">{location}</p>}
        <button onClick={onViewMembers} className="mt-1 flex items-center gap-3 text-xs text-muted-foreground hover:text-foreground">
          <span className="flex items-center gap-1"><Users2 className="h-3 w-3" /> {branch.member_count} {branch.member_count === 1 ? 'member' : 'members'}</span>
          <span>{branch.matter_count} {branch.matter_count === 1 ? 'matter' : 'matters'}</span>
        </button>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}><Pencil /> Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onViewMembers}><Users2 /> Manage members</DropdownMenuItem>
            {!branch.is_head_office && branch.is_active && (
              <DropdownMenuItem onClick={onSetHeadOffice}><Star /> Set as head office</DropdownMenuItem>
            )}
            {!branch.is_head_office && (
              <DropdownMenuItem onClick={onToggleActive}>
                {branch.is_active ? <><Ban /> Deactivate</> : <><RotateCcw /> Reactivate</>}
              </DropdownMenuItem>
            )}
            {!branch.is_head_office && (
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
