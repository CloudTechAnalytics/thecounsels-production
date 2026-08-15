import { Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatterAiChat, useSendMatterAiChatMessage } from '@/features/matters/hooks/use-matter-ai'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import type { ThreadMessage } from '@/features/messaging/types'
import { Card } from '@/shared/components/ui/card'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

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
      toast.error('Could not get a reply', { description: errorMessage(err) })
      throw err
    }
  }

  return (
    <Card className="flex h-[70vh] flex-col overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <p className="font-display text-sm font-semibold">AI Chat</p>
        <p className="text-xs text-muted-foreground">Ask follow-up questions about this matter — grounded in its status, tasks and hearings.</p>
      </div>
      <MessageThread messages={messages} currentUserId={userId} isLoading={isLoading} />
      {readOnly ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          This matter is closed — chat is read-only. Historical messages still show above.
        </p>
      ) : (
        <MessageComposer onSend={onSend} disabled={send.isPending} />
      )}
    </Card>
  )
}
