import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Hash, MessageSquare, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useArchiveChannel,
  useChannelMessages,
  useChannelRealtime,
  useChannels,
  useConversations,
  useDeleteChannel,
  useDeleteChannelMessage,
  useDeleteDirectMessage,
  useDirectMessages,
  useDmRealtime,
  useHideConversation,
  useMarkChannelRead,
  useMarkDmRead,
  useSendChannelMessage,
  useSendDirectMessage,
  useUnarchiveChannel,
} from '@/features/messaging/hooks/use-messaging'
import { ChannelList } from '@/features/messaging/components/channel-list'
import { DmList } from '@/features/messaging/components/dm-list'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import { NewChannelDialog } from '@/features/messaging/components/new-channel-dialog'
import { NewDmDialog } from '@/features/messaging/components/new-dm-dialog'
import { toThreadMessage, type ChannelRow, type ConversationRow } from '@/features/messaging/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

function ChannelPane({
  channelId,
  orgId,
  userId,
  name,
  archived,
}: {
  channelId: string
  orgId: string | null
  userId: string | null
  name?: string
  archived?: boolean
}) {
  const { messages, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useChannelMessages(channelId)
  useChannelRealtime(channelId)
  const send = useSendChannelMessage(orgId, channelId, userId)
  const del = useDeleteChannelMessage(channelId)
  const markRead = useMarkChannelRead(orgId)

  React.useEffect(() => {
    markRead.mutate(channelId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, messages.length])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Hash className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{name ?? 'Channel'}</p>
        {archived && <span className="text-xs text-muted-foreground">— archived, read-only</span>}
      </div>
      <MessageThread
        messages={messages.map(toThreadMessage)}
        currentUserId={userId}
        isLoading={isLoading}
        hasMore={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        onDelete={(id) => del.mutate(id)}
      />
      <MessageComposer disabled={!userId || archived} onSend={(body) => send.mutateAsync(body)} />
    </>
  )
}

function DmPane({ conversationId, orgId, userId, name }: { conversationId: string; orgId: string | null; userId: string | null; name?: string }) {
  const { messages, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useDirectMessages(conversationId)
  useDmRealtime(conversationId)
  const send = useSendDirectMessage(orgId, conversationId, userId)
  const del = useDeleteDirectMessage(conversationId)
  const markRead = useMarkDmRead(orgId)

  React.useEffect(() => {
    markRead.mutate(conversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, messages.length])

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">{name ?? 'Direct message'}</p>
      </div>
      <MessageThread
        messages={messages.map(toThreadMessage)}
        currentUserId={userId}
        isLoading={isLoading}
        hasMore={hasNextPage}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        onDelete={(id) => del.mutate(id)}
      />
      <MessageComposer disabled={!userId} onSend={(body) => send.mutateAsync(body)} />
    </>
  )
}

/** Firm-wide channels + 1:1 direct messages. Active thread is URL-backed
 * (?c=<channelId> / ?dm=<conversationId>) — shareable, back-button-friendly,
 * and what a DM notification's link lands on directly. */
export function MessagesPage() {
  const { activeOrgId, profile, activeMembership } = useAuth()
  const { has } = usePermissions()
  const userId = profile?.id ?? null

  const [params, setParams] = useSearchParams()
  const activeChannelId = params.get('c')
  const activeConversationId = params.get('dm')

  const [showArchived, setShowArchived] = React.useState(false)
  const { data: channels, isLoading: channelsLoading } = useChannels(activeOrgId, userId, showArchived)
  const { data: conversations, isLoading: conversationsLoading } = useConversations(activeOrgId, userId)

  const archiveChannel = useArchiveChannel(activeOrgId)
  const unarchiveChannel = useUnarchiveChannel(activeOrgId)
  const deleteChannel = useDeleteChannel(activeOrgId)
  const hideConversation = useHideConversation(activeOrgId)

  const [newChannelOpen, setNewChannelOpen] = React.useState(false)
  const [newDmOpen, setNewDmOpen] = React.useState(false)
  const [toDelete, setToDelete] = React.useState<ChannelRow | null>(null)
  const [toDeleteConversation, setToDeleteConversation] = React.useState<ConversationRow | null>(null)

  const selectChannel = (id: string) => setParams({ c: id })
  const selectConversation = (id: string) => setParams({ dm: id })

  // Land on the first channel by default so the hub never opens to a blank pane.
  React.useEffect(() => {
    if (!activeChannelId && !activeConversationId && channels && channels.length > 0 && !showArchived) {
      setParams({ c: channels[0].id }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  const activeChannel = channels?.find((c) => c.id === activeChannelId)
  const activeConversation = conversations?.find((c) => c.id === activeConversationId)

  // Creator, org admin (owner), or messaging.manage_channels — mirrors the
  // channels_update/delete_channel RLS predicate server-side; this is only
  // for which button to show, RLS is the real gate either way.
  const canManageChannel = (c: ChannelRow) =>
    c.created_by === userId || Boolean(activeMembership?.is_owner) || has('messaging.manage_channels')

  const doArchive = async (c: ChannelRow) => {
    try {
      await archiveChannel.mutateAsync(c.id)
      toast.success(`#${c.name} archived`)
    } catch (err) {
      toast.error('Could not archive channel', { description: errorMessage(err) })
    }
  }
  const doUnarchive = async (c: ChannelRow) => {
    try {
      await unarchiveChannel.mutateAsync(c.id)
      toast.success(`#${c.name} restored`)
    } catch (err) {
      toast.error('Could not restore channel', { description: errorMessage(err) })
    }
  }
  const doDelete = async () => {
    if (!toDelete) return
    try {
      await deleteChannel.mutateAsync(toDelete.id)
      toast.success(`#${toDelete.name} and its messages were deleted`)
      if (activeChannelId === toDelete.id) setParams({}, { replace: true })
      setToDelete(null)
    } catch (err) {
      toast.error('Could not delete channel', { description: errorMessage(err) })
    }
  }
  const doDeleteConversation = async () => {
    if (!toDeleteConversation) return
    try {
      await hideConversation.mutateAsync(toDeleteConversation.id)
      toast.success(`Chat with ${toDeleteConversation.other?.full_name ?? 'this person'} deleted`)
      if (activeConversationId === toDeleteConversation.id) setParams({}, { replace: true })
      setToDeleteConversation(null)
    } catch (err) {
      toast.error('Could not delete chat', { description: errorMessage(err) })
    }
  }

  return (
    <div>
      <PageHeader title="Messages" description="Chat with your firm — channels and direct messages." />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="flex h-[70vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {showArchived ? 'Archived channels' : 'Channels'}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground"
                onClick={() => setShowArchived((s) => !s)}
                aria-label={showArchived ? 'Back to active channels' : 'Show archived channels'}
                title={showArchived ? 'Back to active channels' : 'Show archived channels'}
              >
                <Archive className="h-3 w-3" />
              </Button>
            </div>
            {!showArchived && has('messaging.create_channels') && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewChannelOpen(true)} aria-label="New channel">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {channelsLoading ? (
              <div className="space-y-1.5 px-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            ) : (
              <ChannelList
                channels={channels ?? []}
                activeId={activeChannelId}
                onSelect={selectChannel}
                canManage={canManageChannel}
                onArchive={doArchive}
                onUnarchive={doUnarchive}
                onDelete={setToDelete}
              />
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Direct messages</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewDmOpen(true)} aria-label="New message">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="max-h-56 overflow-y-auto px-2 pb-3">
            {conversationsLoading ? (
              <div className="space-y-1.5 px-1">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            ) : (
              <DmList
                conversations={conversations ?? []}
                activeId={activeConversationId}
                onSelect={selectConversation}
                onDelete={setToDeleteConversation}
              />
            )}
          </div>
        </Card>

        <Card className="flex h-[70vh] flex-col overflow-hidden">
          {activeChannelId ? (
            <ChannelPane
              key={activeChannelId}
              channelId={activeChannelId}
              orgId={activeOrgId}
              userId={userId}
              name={activeChannel ? `#${activeChannel.name}` : undefined}
              archived={Boolean(activeChannel?.archived_at)}
            />
          ) : activeConversationId ? (
            <DmPane key={activeConversationId} conversationId={activeConversationId} orgId={activeOrgId} userId={userId} name={activeConversation?.other?.full_name ?? undefined} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <MessageSquare className="h-6 w-6" />
              </span>
              <p className="text-sm font-medium">Pick a channel or conversation</p>
              <p className="max-w-xs text-sm text-muted-foreground">Or start something new from the left.</p>
            </div>
          )}
        </Card>
      </div>

      <NewChannelDialog open={newChannelOpen} onOpenChange={setNewChannelOpen} onCreated={selectChannel} />
      <NewDmDialog open={newDmOpen} onOpenChange={setNewDmOpen} onSelected={selectConversation} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete channel"
        destructive
        confirmPhrase="DELETE CHANNEL"
        confirmLabel="Delete channel"
        loading={deleteChannel.isPending}
        description={
          <>
            This permanently deletes <strong>#{toDelete?.name}</strong> and every message in it, for everyone.
            This cannot be undone — if you might want this back, Archive it instead.
          </>
        }
        onConfirm={doDelete}
      />

      <ConfirmDialog
        open={Boolean(toDeleteConversation)}
        onOpenChange={(o) => !o && setToDeleteConversation(null)}
        title="Delete chat"
        confirmLabel="Delete"
        loading={hideConversation.isPending}
        description={
          <>
            This removes your chat with <strong>{toDeleteConversation?.other?.full_name ?? 'this person'}</strong> from your
            list. They can still see it on their side, and it'll come back if either of you sends a new message.
          </>
        }
        onConfirm={doDeleteConversation}
      />
    </div>
  )
}
