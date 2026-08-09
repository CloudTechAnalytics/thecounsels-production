import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Hash, MessageSquare, Plus } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useChannelMessages,
  useChannelRealtime,
  useChannels,
  useConversations,
  useDeleteChannelMessage,
  useDeleteDirectMessage,
  useDirectMessages,
  useDmRealtime,
  useMarkChannelRead,
  useMarkDmRead,
  useSendChannelMessage,
  useSendDirectMessage,
} from '@/features/messaging/hooks/use-messaging'
import { ChannelList } from '@/features/messaging/components/channel-list'
import { DmList } from '@/features/messaging/components/dm-list'
import { MessageThread } from '@/features/messaging/components/message-thread'
import { MessageComposer } from '@/features/messaging/components/message-composer'
import { NewChannelDialog } from '@/features/messaging/components/new-channel-dialog'
import { NewDmDialog } from '@/features/messaging/components/new-dm-dialog'
import { toThreadMessage } from '@/features/messaging/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'

function ChannelPane({ channelId, orgId, userId, name }: { channelId: string; orgId: string | null; userId: string | null; name?: string }) {
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
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const userId = profile?.id ?? null

  const [params, setParams] = useSearchParams()
  const activeChannelId = params.get('c')
  const activeConversationId = params.get('dm')

  const { data: channels, isLoading: channelsLoading } = useChannels(activeOrgId, userId)
  const { data: conversations, isLoading: conversationsLoading } = useConversations(activeOrgId, userId)

  const [newChannelOpen, setNewChannelOpen] = React.useState(false)
  const [newDmOpen, setNewDmOpen] = React.useState(false)

  const selectChannel = (id: string) => setParams({ c: id })
  const selectConversation = (id: string) => setParams({ dm: id })

  // Land on the first channel by default so the hub never opens to a blank pane.
  React.useEffect(() => {
    if (!activeChannelId && !activeConversationId && channels && channels.length > 0) {
      setParams({ c: channels[0].id }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels])

  const activeChannel = channels?.find((c) => c.id === activeChannelId)
  const activeConversation = conversations?.find((c) => c.id === activeConversationId)

  return (
    <div>
      <PageHeader title="Messages" description="Chat with your firm — channels and direct messages." />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="flex h-[70vh] flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channels</p>
            {has('messaging.create_channels') && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewChannelOpen(true)} aria-label="New channel">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {channelsLoading ? (
              <div className="space-y-1.5 px-1">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            ) : (
              <ChannelList channels={channels ?? []} activeId={activeChannelId} onSelect={selectChannel} />
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
              <DmList conversations={conversations ?? []} activeId={activeConversationId} onSelect={selectConversation} />
            )}
          </div>
        </Card>

        <Card className="flex h-[70vh] flex-col overflow-hidden">
          {activeChannelId ? (
            <ChannelPane key={activeChannelId} channelId={activeChannelId} orgId={activeOrgId} userId={userId} name={activeChannel ? `#${activeChannel.name}` : undefined} />
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
    </div>
  )
}
