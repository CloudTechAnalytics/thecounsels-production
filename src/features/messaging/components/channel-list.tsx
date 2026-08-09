import { Hash, MoreHorizontal, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { cn } from '@/shared/lib/utils'
import type { ChannelRow } from '@/features/messaging/types'

export function ChannelList({
  channels,
  activeId,
  onSelect,
  canManage,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  channels: ChannelRow[]
  activeId: string | null
  onSelect: (id: string) => void
  /** Whether the signed-in user may archive/delete this specific channel (creator, org admin, or messaging.manage_channels). */
  canManage: (channel: ChannelRow) => boolean
  onArchive: (channel: ChannelRow) => void
  onUnarchive: (channel: ChannelRow) => void
  onDelete: (channel: ChannelRow) => void
}) {
  if (channels.length === 0) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">No channels yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {channels.map((c) => {
        const archived = Boolean(c.archived_at)
        const manageable = canManage(c)
        return (
          <div
            key={c.id}
            className={cn(
              'group flex items-center gap-1 rounded-lg pr-1 text-sm transition-colors',
              activeId === c.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2.5 text-left"
            >
              <Hash className="h-3.5 w-3.5 shrink-0" />
              <span className={cn('min-w-0 flex-1 truncate', archived && 'italic line-through opacity-70')}>{c.name}</span>
              {c.unread && !archived && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </button>
            {manageable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`Manage #${c.name}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {archived ? (
                    <DropdownMenuItem onClick={() => onUnarchive(c)}>
                      <ArchiveRestore /> Unarchive
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => onArchive(c)}>
                      <Archive /> Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(c)}>
                    <Trash2 /> Delete channel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )
      })}
    </div>
  )
}
