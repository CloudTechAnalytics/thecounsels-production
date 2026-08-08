import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'

export interface RecentActivityItem {
  id: string
  actorName: string
  actorAvatarUrl: string | null
  summary: string
  createdAt: string
  href: string
}

/** Resolves an audit_logs row to an in-app route — mirrors notifications/types.ts's resolveNotificationHref for the audit log's own entity_type vocabulary. */
function resolveHref(entityType: string | null, entityId: string | null, metadata: Record<string, unknown> | null): string {
  switch (entityType) {
    case 'matter':
      return entityId ? `/matters/${entityId}` : '/matters'
    case 'matter_note': {
      const matterId = metadata?.matter_id
      return typeof matterId === 'string' ? `/matters/${matterId}` : '/matters'
    }
    case 'client':
      return '/clients'
    case 'document':
      return '/documents'
    case 'hearing':
      return '/hearings'
    case 'task':
      return '/tasks'
    case 'invoice':
    case 'expense':
    case 'time_entry':
      return '/billing'
    case 'staff_profile':
      return '/staff'
    case 'membership':
    case 'invitation':
    case 'organization':
    case 'support_ticket':
      return '/administration'
    default:
      return '/notifications'
  }
}

/** Firm-wide recent activity feed — same audit_logs source as the Firm Activity trend, just unfiltered by category and richer per-row. */
export function useRecentActivity(organizationId: string | null, limit = 15) {
  return useQuery({
    queryKey: ['dashboard', 'recent-activity', organizationId, limit],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<RecentActivityItem[]> => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, summary, action, entity_type, entity_id, metadata, created_at, actor:profiles(full_name, avatar_url)')
        .eq('organization_id', organizationId!)
        .eq('is_platform_action', false)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error

      return ((data ?? []) as unknown as {
        id: string
        summary: string | null
        action: string
        entity_type: string | null
        entity_id: string | null
        metadata: Record<string, unknown> | null
        created_at: string
        actor: { full_name: string | null; avatar_url: string | null } | null
      }[]).map((row) => ({
        id: row.id,
        actorName: row.actor?.full_name ?? 'Someone',
        actorAvatarUrl: row.actor?.avatar_url ?? null,
        summary: row.summary ?? row.action,
        createdAt: row.created_at,
        href: resolveHref(row.entity_type, row.entity_id, row.metadata),
      }))
    },
  })
}
