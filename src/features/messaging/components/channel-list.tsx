import { Hash } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type { ChannelRow } from '@/features/messaging/types'

export function ChannelList({
  channels,
  activeId,
  onSelect,
}: {
  channels: ChannelRow[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  if (channels.length === 0) {
    return <p className="px-2 py-3 text-xs text-muted-foreground">No channels yet.</p>
  }
  return (
    <div className="space-y-0.5">
      {channels.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c.id)}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
            activeId === c.id ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Hash className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{c.name}</span>
          {c.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  )
}
