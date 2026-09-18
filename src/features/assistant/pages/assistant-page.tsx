import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { MoreHorizontal, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import {
  useAssistantConversations,
  useAssistantMessages,
  useSendAssistantMessage,
  useDeleteAssistantConversation,
} from '@/shared/hooks/use-assistant'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import type { ThreadMessage } from '@/features/messaging/types'
import type { AssistantConversationRow } from '@/shared/services/assistant.service'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { logClientError } from '@/shared/lib/error-log'
import { cn } from '@/shared/lib/utils'

// Same sentinel-author trick the old assistant-dialog.tsx (and
// MatterAiChatPanel) used to reuse MessageThread as-is — anything whose
// author id isn't the signed-in user's left-aligns.
const AI_AUTHOR: ThreadMessage['author'] = { id: 'ai-assistant', full_name: 'Assistant', avatar_url: null }

function ConversationRow({
  conversation,
  active,
  onSelect,
  onDelete,
}: {
  conversation: AssistantConversationRow
  active: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 text-sm transition-colors',
        active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 py-1.5 pl-2.5 text-left">
        <span className="block truncate">{conversation.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Actions for ${conversation.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Cross-cutting schedule/workload + general-legal-knowledge AI assistant —
 * lives at /assistant, a normal page inside the firm workspace shell (the
 * main sidebar — Matters, Clients, etc. — stays visible), NOT a separate
 * full-screen workspace the way /hr is. Real feedback: wanted ChatGPT-style
 * multiple conversations in a sidebar, not the old single-thread floating
 * dialog (assistant-dialog.tsx, now retired). Route is gated the same way
 * the old topbar entry point was — only reachable when the org's plan
 * includes ai_summarization (see router.tsx's withPlanFeature). */
export function AssistantPage() {
  const { activeOrgId, userId, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const activeConversationId = params.get('c')

  const { data: conversations, isLoading: conversationsLoading } = useAssistantConversations(activeOrgId)
  const { data: rows, isLoading: messagesLoading } = useAssistantMessages(activeConversationId)
  const send = useSendAssistantMessage(activeOrgId)
  const del = useDeleteAssistantConversation(activeOrgId)
  const [toDelete, setToDelete] = React.useState<AssistantConversationRow | null>(null)

  const selectConversation = (id: string) => setParams({ c: id })
  const startNewChat = () => setParams({}, { replace: true })

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
      const result = await send.mutateAsync({ conversationId: activeConversationId, message: body })
      // A brand-new conversation only gets its id back here — switch the
      // URL to it now so the sidebar's newly-created row becomes selected
      // instead of leaving the composer pointed at a conversation the URL
      // doesn't reflect yet.
      if (!activeConversationId) setParams({ c: result.conversationId })
    } catch (err) {
      logClientError(err, { source: 'ask-assistant', context: { organizationId: activeOrgId } })
      toast.error('Could not get a reply', { description: errorMessage(err) })
      throw err
    }
  }

  const doDelete = async () => {
    if (!toDelete) return
    try {
      await del.mutateAsync(toDelete.id)
      toast.success('Conversation deleted')
      if (activeConversationId === toDelete.id) startNewChat()
      setToDelete(null)
    } catch (err) {
      toast.error('Could not delete conversation', { description: errorMessage(err) })
    }
  }

  return (
    <div>
      <PageHeader title="Assistant" description="Ask any legal question, or about hearings, tasks and appointments across the firm." />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="flex h-[75vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversations</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startNewChat} aria-label="New chat" title="New chat">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {conversationsLoading ? (
              <div className="space-y-1.5 px-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : conversations && conversations.length > 0 ? (
              <div className="space-y-0.5">
                {conversations.map((c) => (
                  <ConversationRow
                    key={c.id}
                    conversation={c}
                    active={activeConversationId === c.id}
                    onSelect={() => selectConversation(c.id)}
                    onDelete={() => setToDelete(c)}
                  />
                ))}
              </div>
            ) : (
              <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet — say hello to start one.</p>
            )}
          </div>
        </Card>

        <Card className="flex h-[75vh] flex-col overflow-hidden">
          {activeConversationId ? (
            <>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="truncate text-sm font-semibold">
                  {conversations?.find((c) => c.id === activeConversationId)?.title ?? 'Conversation'}
                </p>
              </div>
              <MessageThread messages={messages} currentUserId={userId} isLoading={messagesLoading} pendingReply={send.isPending} />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium">Ask the Assistant anything</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Legal questions, or hearings, tasks and appointments across the firm — say hello to get started.
              </p>
            </div>
          )}
          <MessageComposer onSend={onSend} disabled={send.isPending} />
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete conversation"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={
          <>
            This permanently deletes <strong>{toDelete?.title}</strong> and every message in it. This cannot be undone.
          </>
        }
        onConfirm={doDelete}
      />
    </div>
  )
}
