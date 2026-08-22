import { supabase } from '@/shared/lib/supabase'
import type { TaskStatus } from '@/shared/types/database.types'
import type { TaskFormValues } from '@/features/tasks/schemas'
import type { TaskRow } from '@/features/tasks/types'

const SELECT =
  '*, matter:matters(id, title, matter_number, status), assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url)'

export interface TaskFilters {
  search?: string
  status?: TaskStatus | 'all'
  assigneeId?: string | 'all' | 'me'
  matterId?: string | 'all'
  branchId?: string
}

function toRow(values: TaskFormValues) {
  return {
    title: values.title.trim(),
    description: values.description?.trim() || null,
    status: values.status,
    priority: values.priority,
    assignee_id: values.assigneeId || null,
    matter_id: values.matterId || null,
    due_date: values.dueDate || null,
    completed_at: values.status === 'done' ? new Date().toISOString() : null,
    // Only meaningful for standalone (matterId-less) tasks — a matter-
    // linked task derives its branch purely from the matter, so its own
    // branch_id stays null even if the form happened to have one set.
    branch_id: values.matterId ? null : values.branchId || null,
  }
}

export const tasksService = {
  async get(id: string): Promise<TaskRow | null> {
    const { data, error } = await supabase.from('tasks').select(SELECT).eq('id', id).maybeSingle()
    if (error) throw error
    return data as unknown as TaskRow | null
  },

  async list(organizationId: string, filters: TaskFilters, currentUserId: string | null): Promise<TaskRow[]> {
    let q = supabase
      .from('tasks')
      .select(SELECT)
      .eq('organization_id', organizationId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
    if (filters.matterId && filters.matterId !== 'all') q = q.eq('matter_id', filters.matterId)
    if (filters.assigneeId === 'me' && currentUserId) q = q.eq('assignee_id', currentUserId)
    else if (filters.assigneeId && filters.assigneeId !== 'all' && filters.assigneeId !== 'me')
      q = q.eq('assignee_id', filters.assigneeId)
    if (filters.branchId) q = q.eq('branch_id', filters.branchId)
    if (filters.search?.trim()) q = q.ilike('title', `%${filters.search.trim()}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as unknown as TaskRow[]
  },

  async create(organizationId: string, values: TaskFormValues, createdBy: string | null): Promise<void> {
    const { error } = await supabase
      .from('tasks')
      .insert({ organization_id: organizationId, created_by: createdBy, ...toRow(values) })
    if (error) throw error
  },

  async update(id: string, organizationId: string, values: TaskFormValues): Promise<void> {
    const { data, error } = await supabase.from('tasks').update(toRow(values)).eq('id', id).select('title').single()
    if (error) throw error
    // Logged here (not a DB trigger) so standalone tasks — no matter_id, which
    // the matter_events trigger requires — still show up in firm activity.
    if (values.status === 'done') {
      await supabase.rpc('log_audit', {
        p_org: organizationId,
        p_action: 'task.completed',
        p_entity_type: 'task',
        p_entity_id: id,
        p_summary: `Completed task: ${data.title}`,
      })
    }
  },

  async setStatus(id: string, organizationId: string, status: TaskStatus): Promise<void> {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
      .eq('id', id)
      .select('title')
      .single()
    if (error) throw error
    if (status === 'done') {
      await supabase.rpc('log_audit', {
        p_org: organizationId,
        p_action: 'task.completed',
        p_entity_type: 'task',
        p_entity_id: id,
        p_summary: `Completed task: ${data.title}`,
      })
    }
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) throw error
  },
}
