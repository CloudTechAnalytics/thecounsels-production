import { supabase } from '@/shared/lib/supabase'

/** Plain user-to-user reply thread on a task — unlike matter_ai_chat, both
 * sides are real users writing directly, no Edge Function mediation needed.
 * RLS (migration 0109) scopes reads/writes to has_task_access(); a new
 * comment notifies whichever of assignee/creator didn't just post. */
export interface TaskCommentRow {
  id: string
  task_id: string
  body: string
  created_at: string
  user: { id: string; full_name: string | null; avatar_url: string | null } | null
}

export const taskCommentsService = {
  async list(taskId: string): Promise<TaskCommentRow[]> {
    const { data, error } = await supabase
      .from('task_comments')
      .select('id, task_id, body, created_at, user:profiles(id, full_name, avatar_url)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as TaskCommentRow[]
  },

  async add(taskId: string, organizationId: string, userId: string, body: string): Promise<void> {
    const { error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, organization_id: organizationId, user_id: userId, body })
    if (error) throw error
  },
}
