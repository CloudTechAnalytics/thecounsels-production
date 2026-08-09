import { initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { isRecentlyActive, type ConversationRow } from '@/features/messaging/types'

export function DmList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations: ConversationRow[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (conversations.length === 0) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
            activeId === c.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
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
      ))}
    </div>
  )
}
