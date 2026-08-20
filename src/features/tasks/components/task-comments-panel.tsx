import { MessageSquare } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useTaskComments, useAddTaskComment } from '@/features/tasks/hooks/use-task-comments'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import type { ThreadMessage } from '@/features/messaging/types'
import { Card } from '@/shared/components/ui/card'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

/** A task's reply thread — near-identical to matter-ai-chat-panel.tsx, but
 * every comment already carries its real author (both sides are real
 * users, no AI sentinel author needed). readOnly mirrors the closed-matter
 * convention used everywhere else (documents, hearings, matter notes). */
export function TaskCommentsPanel({
  taskId,
  organizationId,
  readOnly,
}: {
  taskId: string
  organizationId: string | null
  readOnly?: boolean
}) {
  const { userId } = useAuth()
  const { data: rows, isLoading } = useTaskComments(taskId)
  const send = useAddTaskComment(taskId, organizationId, userId)

  const messages: ThreadMessage[] = (rows ?? []).map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    deletedAt: null,
    author: c.user,
  }))

  const onSend = async (body: string) => {
    try {
      await send.mutateAsync(body)
    } catch (err) {
      toast.error('Could not send reply', { description: errorMessage(err) })
      throw err
    }
  }

  return (
    <Card className="flex h-[60vh] flex-col overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-primary" />
        <p className="font-display text-sm font-semibold">Replies</p>
      </div>
      <MessageThread messages={messages} currentUserId={userId} isLoading={isLoading} />
      {readOnly ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          This task is on a closed matter — replies are read-only. Historical messages still show above.
        </p>
      ) : (
        <MessageComposer onSend={onSend} disabled={send.isPending} />
      )}
    </Card>
  )
}
