import * as React from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { messagingService } from '@/features/messaging/services/messaging.service'
import type { ChannelFormValues } from '@/features/messaging/schemas'
import { supabase } from '@/shared/lib/supabase'
import type { ChannelMessageRow, DirectMessageRow } from '@/features/messaging/types'

const keys = {
  // 3-element prefix — invalidating with this (no `exact: true`) catches
  // both the active and archived variants below in one call.
  channelsAll: (orgId: string) => ['messaging', 'channels', orgId] as const,
  channels: (orgId: string, includeArchived = false) => ['messaging', 'channels', orgId, includeArchived] as const,
  channelMessages: (channelId: string) => ['messaging', 'channel-messages', channelId] as const,
  conversations: (orgId: string) => ['messaging', 'conversations', orgId] as const,
  directMessages: (conversationId: string) => ['messaging', 'direct-messages', conversationId] as const,
  unread: (orgId: string) => ['messaging', 'unread', orgId] as const,
}

export function useChannels(orgId: string | null, userId: string | null, includeArchived = false) {
  return useQuery({
    queryKey: keys.channels(orgId ?? 'none', includeArchived),
    enabled: Boolean(orgId && userId),
    queryFn: () => messagingService.listChannels(orgId!, userId!, includeArchived),
  })
}

export function useCreateChannel(orgId: string | null, createdBy: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (values: ChannelFormValues) => messagingService.createChannel(orgId!, values, createdBy!),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channelsAll(orgId ?? 'none') }),
  })
}

export function useArchiveChannel(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.archiveChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channelsAll(orgId ?? 'none') }),
  })
}

export function useUnarchiveChannel(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.unarchiveChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channelsAll(orgId ?? 'none') }),
  })
}

export function useDeleteChannel(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channelsAll(orgId ?? 'none') }),
  })
}

/** Oldest-first flattened message list, with a `loadEarlier` you can wire to a "Load earlier" button. */
export function useChannelMessages(channelId: string | null) {
  const query = useInfiniteQuery({
    queryKey: keys.channelMessages(channelId ?? 'none'),
    enabled: Boolean(channelId),
    queryFn: ({ pageParam }) => messagingService.listChannelMessages(channelId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.length > 0 ? lastPage[0].created_at : undefined),
  })
  const messages = React.useMemo<ChannelMessageRow[]>(
    () => [...query.data?.pages ?? []].reverse().flat(),
    [query.data],
  )
  return { ...query, messages }
}

export function useSendChannelMessage(orgId: string | null, channelId: string | null, authorId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => messagingService.sendChannelMessage(orgId!, channelId!, authorId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channelMessages(channelId ?? 'none') }),
  })
}

export function useDeleteChannelMessage(channelId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteChannelMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.channelMessages(channelId ?? 'none') }),
  })
}

export function useMarkChannelRead(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (channelId: string) => messagingService.markChannelRead(channelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.channels(orgId ?? 'none') })
      qc.invalidateQueries({ queryKey: keys.unread(orgId ?? 'none') })
    },
  })
}

export function useConversations(orgId: string | null, userId: string | null) {
  return useQuery({
    queryKey: keys.conversations(orgId ?? 'none'),
    enabled: Boolean(orgId && userId),
    queryFn: () => messagingService.listConversations(orgId!, userId!),
  })
}

export function useGetOrCreateConversation(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (otherUserId: string) => messagingService.getOrCreateConversation(orgId!, otherUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.conversations(orgId ?? 'none') }),
  })
}

export function useDirectMessages(conversationId: string | null) {
  const query = useInfiniteQuery({
    queryKey: keys.directMessages(conversationId ?? 'none'),
    enabled: Boolean(conversationId),
    queryFn: ({ pageParam }) => messagingService.listDirectMessages(conversationId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.length > 0 ? lastPage[0].created_at : undefined),
  })
  const messages = React.useMemo<DirectMessageRow[]>(
    () => [...query.data?.pages ?? []].reverse().flat(),
    [query.data],
  )
  return { ...query, messages }
}

export function useSendDirectMessage(orgId: string | null, conversationId: string | null, authorId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string) => messagingService.sendDirectMessage(orgId!, conversationId!, authorId!, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.directMessages(conversationId ?? 'none') }),
  })
}

export function useDeleteDirectMessage(conversationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => messagingService.deleteDirectMessage(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.directMessages(conversationId ?? 'none') }),
  })
}

export function useMarkDmRead(orgId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conversationId: string) => messagingService.markDmRead(conversationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.conversations(orgId ?? 'none') })
      qc.invalidateQueries({ queryKey: keys.unread(orgId ?? 'none') })
    },
  })
}

export function useUnreadMessageCount(orgId: string | null) {
  return useQuery({
    queryKey: keys.unread(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: () => messagingService.getUnreadCount(orgId!),
  })
}

/** Live message stream for whichever channel thread is currently open. */
export function useChannelRealtime(channelId: string | null) {
  const qc = useQueryClient()
  React.useEffect(() => {
    if (!channelId) return
    const channel = supabase
      .channel(`messages:channel:${channelId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channel_messages', filter: `channel_id=eq.${channelId}` },
        () => qc.invalidateQueries({ queryKey: keys.channelMessages(channelId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId, qc])
}

/** Live message stream for whichever DM thread is currently open. */
export function useDmRealtime(conversationId: string | null) {
  const qc = useQueryClient()
  React.useEffect(() => {
    if (!conversationId) return
    const channel = supabase
      .channel(`messages:dm:${conversationId}:${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: keys.directMessages(conversationId) }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, qc])
}

/** Org-wide subscription keeping the sidebar unread badge and lists fresh
 * regardless of which (if any) thread is currently open. Mount once, high
 * in the tree (OrganizationLayout), same relationship
 * useNotificationsRealtime has with useUnreadNotificationCount. */
export function useMessagingBadgeRealtime(orgId: string | null) {
  const qc = useQueryClient()
  React.useEffect(() => {
    if (!orgId) return
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: keys.unread(orgId) })
      qc.invalidateQueries({ queryKey: keys.channels(orgId) })
      qc.invalidateQueries({ queryKey: keys.conversations(orgId) })
    }
    const channel = supabase
      .channel(`messaging-badge:${orgId}:${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages', filter: `organization_id=eq.${orgId}` }, invalidate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `organization_id=eq.${orgId}` }, invalidate)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, qc])
}
