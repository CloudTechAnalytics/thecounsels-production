import { supabase } from '@/shared/lib/supabase'
import type { NotificationCategory, NotificationPreferences, NotificationPriority, TaskChannelPrefs } from '@/shared/types/database.types'
import type { NotificationItem } from '@/features/notifications/types'

export const DEFAULT_TASK_CHANNEL_PREFS: TaskChannelPrefs = {
  assigned: { email: true, whatsapp: true },
  due_soon: { email: true, whatsapp: true },
  overdue: { email: true, whatsapp: true },
  completed: { email: true, whatsapp: true },
  reassigned: { email: true, whatsapp: true },
  hearing_reminder: { email: true, whatsapp: true },
}

const SELECT = '*, actor:profiles!notifications_actor_id_fkey(id, full_name, avatar_url)'

export interface NotificationFilters {
  category?: NotificationCategory | 'all'
  priority?: NotificationPriority | 'all'
  search?: string
  archived?: boolean
}
export interface NotificationPage {
  rows: NotificationItem[]
  total: number
}
export const NOTIFICATIONS_PAGE_SIZE = 20

export const notificationsService = {
  async list(
    organizationId: string,
    filters: NotificationFilters = {},
    pagination?: { page: number; pageSize: number },
  ): Promise<NotificationPage> {
    let q = supabase
      .from('notifications')
      .select(SELECT, { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('is_archived', Boolean(filters.archived))
      .order('created_at', { ascending: false })
    if (filters.category && filters.category !== 'all') q = q.eq('category', filters.category)
    if (filters.priority && filters.priority !== 'all') q = q.eq('priority', filters.priority)
    if (filters.search?.trim()) q = q.ilike('title', `%${filters.search.trim()}%`)

    if (pagination) {
      const from = (pagination.page - 1) * pagination.pageSize
      q = q.range(from, from + pagination.pageSize - 1)
    } else {
      q = q.range(0, 999)
    }

    const { data, error, count } = await q
    if (error) throw error
    return { rows: (data ?? []) as unknown as NotificationItem[], total: count ?? 0 }
  },

  async unreadCount(organizationId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .eq('is_read', false)
    if (error) throw error
    return count ?? 0
  },

  async recent(organizationId: string, limit = 8): Promise<NotificationItem[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select(SELECT)
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as unknown as NotificationItem[]
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async markAllRead(organizationId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_all_notifications_read', { p_org: organizationId })
    if (error) throw error
  },

  async setArchived(id: string, archived: boolean): Promise<void> {
    const { error } = await supabase.from('notifications').update({ is_archived: archived }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) throw error
  },

  /** Deletes every notification (read/unread, archived or not) for this
   * user in this org — RLS already scopes deletes to user_id = auth.uid(),
   * the org filter here just keeps this from touching a user's
   * notifications in a different firm they also belong to. */
  async removeAll(organizationId: string): Promise<void> {
    const { error } = await supabase.from('notifications').delete().eq('organization_id', organizationId)
    if (error) throw error
  },

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const { data, error } = await supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()
    if (error) throw error
    return (
      data ?? {
        user_id: userId,
        in_app_enabled: true,
        browser_enabled: false,
        email_enabled: false,
        sms_enabled: false,
        whatsapp_enabled: false,
        whatsapp_number: null,
        task_channel_prefs: DEFAULT_TASK_CHANNEL_PREFS,
        updated_at: new Date().toISOString(),
      }
    )
  },

  async setPreferences(userId: string, patch: Partial<NotificationPreferences>): Promise<void> {
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...patch })
    if (error) throw error
  },
}
