import * as React from 'react'
import { format, isToday } from 'date-fns'
import { Trash2, MessageSquare } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import type { ThreadMessage } from '@/features/messaging/types'

function AuthorAvatar({ author }: { author: ThreadMessage['author'] }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
      {author?.avatar_url ? (
        <img src={author.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(author?.full_name, 'U')
      )}
    </span>
  )
}

/** Shared by both channel and DM views. Own messages right-aligned, others' left-aligned with avatar/name. */
export function MessageThread({
  messages,
  currentUserId,
  isLoading,
  hasMore,
  onLoadMore,
  isLoadingMore,
  onDelete,
}: {
  messages: ThreadMessage[]
  currentUserId: string | null
  isLoading: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  isLoadingMore?: boolean
  onDelete?: (id: string) => void
}) {
  const bottomRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (isLoading) {
    return (
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)}
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <MessageSquare className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-sm text-muted-foreground">Say hello to get the conversation started.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      {hasMore && (
        <div className="flex justify-center pb-2">
          <Button variant="ghost" size="sm" loading={isLoadingMore} onClick={onLoadMore}>
            Load earlier messages
          </Button>
        </div>
      )}
      {messages.map((m) => {
        const mine = m.author?.id === currentUserId
        const time = new Date(m.createdAt)
        return (
          <div key={m.id} className={cn('group flex items-end gap-2', mine && 'flex-row-reverse')}>
            {!mine && <AuthorAvatar author={m.author} />}
            <div className={cn('max-w-[70%] rounded-lg px-3 py-2 text-sm', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {!mine && <p className="mb-0.5 text-xs font-semibold">{m.author?.full_name ?? 'Unknown'}</p>}
              {m.deletedAt ? (
                <p className="italic opacity-70">Message deleted</p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              )}
              <p className={cn('mt-1 text-[10px] opacity-70')}>
                {isToday(time) ? format(time, 'HH:mm') : format(time, 'MMM d, HH:mm')}
              </p>
            </div>
            {mine && !m.deletedAt && onDelete && (
              <button
                type="button"
                aria-label="Delete message"
                onClick={() => onDelete(m.id)}
                className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
