import * as React from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useAssistantMessages, useSendAssistantMessage, useClearAssistantMessages } from '@/shared/hooks/use-assistant'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import type { ThreadMessage } from '@/features/messaging/types'
import { Dialog, DialogContent, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { logClientError } from '@/shared/lib/error-log'

// Same sentinel-author trick MatterAiChatPanel uses to reuse MessageThread
// as-is — anything whose author id isn't the signed-in user's left-aligns.
const AI_AUTHOR: ThreadMessage['author'] = { id: 'ai-assistant', full_name: 'Assistant', avatar_url: null }

/** Cross-cutting schedule/workload AI assistant — "show upcoming hearings
 * this week with client names and advocates." Distinct from the per-matter
 * AI (which is scoped to one matter's own context): this one decides what
 * to look up via Groq tool calling (ask-assistant Edge Function),
 * across hearings/tasks/appointments only. Entry point is a topbar button
 * next to GlobalSearch, gated the same way the HR workspace link is —
 * only shown when the org's plan includes ai_summarization. */
export function AssistantDialog() {
  const { activeOrgId, userId, profile } = useAuth()
  const [open, setOpen] = React.useState(false)
  const { data: rows, isLoading } = useAssistantMessages(activeOrgId)
  const send = useSendAssistantMessage(activeOrgId)
  const clear = useClearAssistantMessages(activeOrgId)
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
      logClientError(err, { source: 'ask-assistant', context: { organizationId: activeOrgId } })
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
            <p className="flex-1 text-xs text-muted-foreground">Ask about hearings, tasks and appointments across the firm.</p>
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
          <MessageComposer onSend={onSend} disabled={send.isPending} />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear chat"
        destructive
        confirmLabel="Clear chat"
        loading={clear.isPending}
        description="This permanently deletes your assistant chat history. This cannot be undone."
        onConfirm={async () => {
          try {
            await clear.mutateAsync()
            setConfirmClear(false)
          } catch (err) {
            logClientError(err, { source: 'ask-assistant-clear', context: { organizationId: activeOrgId } })
            toast.error('Could not clear chat', { description: errorMessage(err) })
          }
        }}
      />
    </>
  )
}
