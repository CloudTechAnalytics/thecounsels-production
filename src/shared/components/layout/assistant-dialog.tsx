import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useAssistantMessages, useSendAssistantMessage } from '@/shared/hooks/use-assistant'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import type { ThreadMessage } from '@/features/messaging/types'
import { Dialog, DialogContent, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

// Same sentinel-author trick MatterAiChatPanel uses to reuse MessageThread
// as-is — anything whose author id isn't the signed-in user's left-aligns.
const AI_AUTHOR: ThreadMessage['author'] = { id: 'ai-assistant', full_name: 'Assistant', avatar_url: null }

/** Cross-cutting schedule/workload AI assistant — "show upcoming hearings
 * this week with client names and advocates." Distinct from the per-matter
 * AI (which is scoped to one matter's own context): this one decides what
 * to look up via Gemini tool calling (ask-assistant Edge Function),
 * across hearings/tasks/appointments only. Entry point is a topbar button
 * next to GlobalSearch, gated the same way the HR workspace link is —
 * only shown when the org's plan includes ai_summarization. */
export function AssistantDialog() {
  const { activeOrgId, userId, profile } = useAuth()
  const [open, setOpen] = React.useState(false)
  const { data: rows, isLoading } = useAssistantMessages(activeOrgId)
  const send = useSendAssistantMessage(activeOrgId)

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
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask the assistant"
        title="Ask the assistant"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent"
      >
        <Sparkles className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[70vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Ask the assistant</DialogTitle>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="font-display text-sm font-semibold">Assistant</p>
            <p className="text-xs text-muted-foreground">Ask about hearings, tasks and appointments across the firm.</p>
          </div>
          <MessageThread messages={messages} currentUserId={userId} isLoading={isLoading} />
          <MessageComposer onSend={onSend} disabled={send.isPending} />
        </DialogContent>
      </Dialog>
    </>
  )
}
