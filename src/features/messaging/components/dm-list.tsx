import { X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { isRecentlyActive, type ConversationRow } from '@/features/messaging/types'

export function DmList({
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  conversations: ConversationRow[]
  activeId: string | null
  onSelect: (id: string) => void
  /** Removes the conversation from the signed-in user's own list only — see hide_dm_conversation (migration 0123). */
  onDelete: (conversation: ConversationRow) => void
}) {
  if (conversations.length === 0) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {conversations.map((c) => (
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
            className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pl-2.5 text-left"
          >
            <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 text-[9px] font-semibold text-primary">
              {c.other?.avatar_url ? (
                <img src={c.other.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsOf(c.other?.full_name, 'U')
              )}
              {isRecentlyActive(c.other?.last_seen_at ?? null) && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-card" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.other?.full_name ?? 'Unknown'}</span>
            {c.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Delete chat with ${c.other?.full_name ?? 'this person'}`}
            title="Delete chat"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(c)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}
