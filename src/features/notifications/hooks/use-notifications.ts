import * as React from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  notificationsService,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationFilters,
} from '@/features/notifications/services/notifications.service'
import { supabase } from '@/shared/lib/supabase'
import type { NotificationPreferences, NotificationRow } from '@/shared/types/database.types'

const keys = {
  list: (orgId: string, filters: NotificationFilters, page: number) => ['notifications', orgId, 'list', filters, page] as const,
  unread: (orgId: string) => ['notifications', orgId, 'unread'] as const,
  recent: (orgId: string) => ['notifications', orgId, 'recent'] as const,
  preferences: (userId: string) => ['notifications', 'preferences', userId] as const,
}

export function useNotifications(orgId: string | null, filters: NotificationFilters, page: number, pageSize = NOTIFICATIONS_PAGE_SIZE) {
  return useQuery({
    queryKey: keys.list(orgId ?? 'none', filters, page),
    enabled: Boolean(orgId),
    queryFn: () => notificationsService.list(orgId!, filters, { page, pageSize }),
    placeholderData: keepPreviousData,
  })
}

export function useUnreadNotificationCount(orgId: string | null) {
  return useQuery({
    queryKey: keys.unread(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: () => notificationsService.unreadCount(orgId!),
  })
}

export function useRecentNotifications(orgId: string | null) {
  return useQuery({
    queryKey: keys.recent(orgId ?? 'none'),
    enabled: Boolean(orgId),
    queryFn: () => notificationsService.recent(orgId!),
  })
}

/** Realtime subscription driving the bell badge/dropdown and, via onInsert, browser push. */
export function useNotificationsRealtime(orgId: string | null, userId: string | null, onInsert?: (row: NotificationRow) => void) {
  const qc = useQueryClient()
  const onInsertRef = React.useRef(onInsert)
  onInsertRef.current = onInsert

  React.useEffect(() => {
    if (!orgId || !userId) return
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ['notifications', orgId] })
          if (payload.eventType === 'INSERT') onInsertRef.current?.(payload.new as NotificationRow)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, userId, qc])
}

function useInvalidate(orgId: string | null) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['notifications', orgId ?? 'none'] })
  }
}

export function useMarkNotificationRead(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (id: string) => notificationsService.markRead(id), onSuccess: invalidate })
}

export function useMarkAllNotificationsRead(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: () => notificationsService.markAllRead(orgId!), onSuccess: invalidate })
}

export function useSetNotificationArchived(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => notificationsService.setArchived(id, archived),
    onSuccess: invalidate,
  })
}

export function useDeleteNotification(orgId: string | null) {
  const invalidate = useInvalidate(orgId)
  return useMutation({ mutationFn: (id: string) => notificationsService.remove(id), onSuccess: invalidate })
}

export function useNotificationPreferences(userId: string | null) {
  return useQuery({
    queryKey: keys.preferences(userId ?? 'none'),
    enabled: Boolean(userId),
    queryFn: () => notificationsService.getPreferences(userId!),
  })
}

export function useUpdateNotificationPreferences(userId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<NotificationPreferences>) => notificationsService.setPreferences(userId!, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.preferences(userId ?? 'none') }),
  })
}
