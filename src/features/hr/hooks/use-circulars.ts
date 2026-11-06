import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database, RoleKey } from '@/shared/types/database.types'

export type Circular = Database['public']['Tables']['hr_announcements']['Row']
export type CircularRecipient = Database['public']['Tables']['hr_announcement_recipients']['Row'] & {
  profile: { full_name: string | null; email: string } | null
}
/** A circular with the signed-in user's own read / acknowledge state (null if not sent to them). */
export type CircularForMe = Circular & { mine: Pick<CircularRecipient, 'read_at' | 'acknowledged_at'> | null; acked: number; read: number }

export const CIRCULAR_CATEGORIES = ['Policy', 'Notice', 'Office closure', 'HR', 'Finance', 'Event', 'Other'] as const

const keys = {
  list: (org: string | null) => ['circulars', org] as const,
  one: (id: string | undefined) => ['circulars', 'one', id] as const,
  recipients: (id: string | undefined) => ['circulars', 'recipients', id] as const,
}

export function useCirculars(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: keys.list(organizationId),
    enabled: Boolean(organizationId && userId),
    queryFn: async (): Promise<CircularForMe[]> => {
      const [{ data: rows, error }, { data: recips, error: e2 }] = await Promise.all([
        supabase.from('hr_announcements').select('*').eq('organization_id', organizationId!).order('created_at', { ascending: false }),
        supabase.from('hr_announcement_recipients').select('announcement_id, user_id, read_at, acknowledged_at').eq('organization_id', organizationId!),
      ])
      if (error) throw error
      if (e2) throw e2
      return (rows ?? []).map((c) => {
        const all = (recips ?? []).filter((r) => r.announcement_id === c.id)
        const mine = all.find((r) => r.user_id === userId) ?? null
        return { ...c, mine, acked: all.filter((r) => r.acknowledged_at).length, read: all.filter((r) => r.read_at).length }
      })
    },
  })
}

export function useCircular(id: string | undefined) {
  return useQuery({
    queryKey: keys.one(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('hr_announcements').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Circular | null
    },
  })
}

export function useCircularRecipients(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.recipients(id),
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('hr_announcement_recipients')
        .select('*, profile:profiles!hr_announcement_recipients_user_id_fkey(full_name, email)').eq('announcement_id', id!)
      if (error) throw error
      return (data ?? []) as unknown as CircularRecipient[]
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['circulars'] })
    qc.invalidateQueries({ queryKey: ['hr', 'unread-announcement-count'] })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
}

export interface CircularInput {
  title: string
  body: string
  audienceType: string
  departmentId?: string | null
  userIds?: string[] | null
  branchId?: string | null
  roleKey?: RoleKey | null
  requiresAck: boolean
  ackDue?: string | null
  pinned: boolean
  category?: string | null
  file?: File | null
}

export function useSendCircular(organizationId: string | null) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (v: CircularInput) => {
      let path: string | null = null
      if (v.file) {
        path = `${organizationId}/${crypto.randomUUID()}/${v.file.name.replace(/[^\w.\- ]+/g, '_')}`
        const { error } = await supabase.storage.from('circulars').upload(path, v.file, { contentType: v.file.type || 'application/octet-stream' })
        if (error) throw error
      }
      const { data, error } = await supabase.rpc('send_circular', {
        p_org: organizationId!, p_title: v.title, p_body: v.body, p_audience_type: v.audienceType,
        p_department_id: v.departmentId ?? null, p_user_ids: v.userIds ?? null, p_branch_id: v.branchId ?? null, p_role_key: v.roleKey ?? null,
        p_requires_ack: v.requiresAck, p_ack_due: v.ackDue || null, p_pinned: v.pinned, p_category: v.category ?? null,
        p_attachment_path: path, p_attachment_name: v.file?.name ?? null,
      })
      if (error) {
        if (path) await supabase.storage.from('circulars').remove([path])
        throw error
      }
      return data as Circular
    },
    onSuccess: invalidate,
  })
}

export function useMarkCircularRead() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('mark_circular_read', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useAcknowledgeCircular() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async ({ id, withSignature }: { id: string; withSignature: boolean }) => {
      const { error } = await supabase.rpc('acknowledge_circular', { p_id: id, p_with_signature: withSignature })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRemindCircular() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('remind_circular', { p_id: id })
      if (error) throw error
      return data as number
    },
    onSuccess: invalidate,
  })
}

export function useDeleteCircular() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (c: Circular) => {
      const { error } = await supabase.from('hr_announcements').delete().eq('id', c.id)
      if (error) throw error
      if (c.attachment_path) await supabase.storage.from('circulars').remove([c.attachment_path])
    },
    onSuccess: invalidate,
  })
}

export async function openCircularAttachment(path: string) {
  const { data, error } = await supabase.storage.from('circulars').createSignedUrl(path, 300)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}
