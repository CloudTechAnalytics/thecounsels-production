import * as React from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatterAiChat, useSendMatterAiChatMessage, useClearMatterAiChat } from '@/features/matters/hooks/use-matter-ai'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import type { ThreadMessage } from '@/features/messaging/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { logClientError } from '@/shared/lib/error-log'

// Sentinel author for AI replies — reuses MessageThread as-is (it was
// explicitly built data-model-agnostic, "shared by both channel and DM
// views"). Its own `mine = author?.id === currentUserId` check left-aligns
// anything whose author id isn't the signed-in user's, so this just needs
// an id that can never collide with a real profile id.
const AI_AUTHOR: ThreadMessage['author'] = { id: 'ai-assistant', full_name: 'AI Assistant', avatar_url: null }

/** Conversational follow-up on a matter — builds on the one-shot AI Matter
 * Summary card. Per-user history, persisted (matter_ai_chat_messages,
 * migration 0102), reached via the "Chat" button next to Regenerate on
 * that card, or this tab directly. */
export function MatterAiChatPanel({ matterId, readOnly }: { matterId: string; readOnly?: boolean }) {
  const { userId, profile } = useAuth()
  const { data: rows, isLoading } = useMatterAiChat(matterId)
  const send = useSendMatterAiChatMessage(matterId)
  const clear = useClearMatterAiChat(matterId)
  const [confirmClear, setConfirmClear] = React.useState(false)

  const messages: ThreadMessage[] = (rows ?? []).map((m) => ({
    id: m.id,
    body: m.content,
    createdAt: m.created_at,
    deletedAt: null,
    author:
      m.role === 'user'
        ? { id: userId ?? '', full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null }
        : AI_AUTHOR,
  }))

  const onSend = async (body: string) => {
    try {
      await send.mutateAsync(body)
    } catch (err) {
      logClientError(err, { source: 'chat-with-matter', context: { matterId } })
      toast.error('Could not get a reply', { description: errorMessage(err) })
      throw err
    }
  }

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-display text-sm font-semibold">AI Chat</p>
        <p className="flex-1 text-xs text-muted-foreground">Ask follow-up questions about this matter — grounded in its status, tasks and hearings.</p>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmClear(true)}
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <MessageThread messages={messages} currentUserId={userId} isLoading={isLoading} pendingReply={send.isPending} />
      {readOnly ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          This matter is closed — chat is read-only. Historical messages still show above.
        </p>
      ) : (
        <MessageComposer onSend={onSend} disabled={send.isPending} />
      )}

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear chat"
        destructive
        confirmLabel="Clear chat"
        loading={clear.isPending}
        description="This permanently deletes your AI chat history for this matter. This cannot be undone."
        onConfirm={async () => {
          try {
            await clear.mutateAsync()
            setConfirmClear(false)
          } catch (err) {
            logClientError(err, { source: 'chat-with-matter-clear', context: { matterId } })
            toast.error('Could not clear chat', { description: errorMessage(err) })
          }
        }}
      />
    </Card>
  )
}
