import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database, Json, RoleKey } from '@/shared/types/database.types'

export type Survey = Database['public']['Tables']['surveys']['Row']
export type SurveyQuestion = Database['public']['Tables']['survey_questions']['Row']
export type QuestionKind = SurveyQuestion['kind']
export type SurveyWithMine = Survey & { my_responded_at: string | null; i_am_recipient: boolean }

export const QUESTION_KINDS: { kind: QuestionKind; label: string; hint: string }[] = [
  { kind: 'single', label: 'One choice', hint: 'Pick one option' },
  { kind: 'multi', label: 'Several choices', hint: 'Tick all that apply' },
  { kind: 'rating', label: 'Rating 1–5', hint: '1 = poor, 5 = excellent' },
  { kind: 'yesno', label: 'Yes / No', hint: 'A simple yes or no' },
  { kind: 'text', label: 'Written answer', hint: 'Free text' },
]
export const RATING_LABELS = ['Very poor', 'Poor', 'Okay', 'Good', 'Excellent']

/** Ready-made questionnaires to start from. */
export const SURVEY_TEMPLATES: { name: string; title: string; description: string; questions: DraftQuestion[] }[] = [
  {
    name: 'Staff satisfaction', title: 'Staff satisfaction survey', description: 'Your honest answers help us make this a better place to work. This survey is anonymous.',
    questions: [
      { kind: 'rating', prompt: 'Overall, how satisfied are you working here?', options: [], required: true },
      { kind: 'rating', prompt: 'How manageable is your workload?', options: [], required: true },
      { kind: 'rating', prompt: 'How well does your line manager support you?', options: [], required: true },
      { kind: 'yesno', prompt: 'Do you see yourself working here in two years?', options: [], required: true },
      { kind: 'multi', prompt: 'Which of these would improve your work most?', options: ['Training & CPD', 'Better equipment', 'Flexible hours', 'Clearer communication', 'Recognition'], required: false },
      { kind: 'text', prompt: 'What one thing should the firm change?', options: [], required: false },
    ],
  },
  {
    name: 'Training needs', title: 'Training needs assessment', description: 'Help us plan this year’s training.',
    questions: [
      { kind: 'multi', prompt: 'Which areas would you like training in?', options: ['Litigation & advocacy', 'Legal drafting', 'Corporate & commercial', 'Technology & tools', 'Client care', 'Leadership'], required: true },
      { kind: 'single', prompt: 'How do you prefer to learn?', options: ['In person', 'Online live', 'Self-paced online', 'Mentoring'], required: true },
      { kind: 'text', prompt: 'Any specific course or skill you have in mind?', options: [], required: false },
    ],
  },
  {
    name: 'Event feedback', title: 'Event feedback', description: 'Tell us how the event went.',
    questions: [
      { kind: 'rating', prompt: 'How would you rate the event overall?', options: [], required: true },
      { kind: 'yesno', prompt: 'Was it a good use of your time?', options: [], required: true },
      { kind: 'text', prompt: 'What should we do differently next time?', options: [], required: false },
    ],
  },
]

export interface DraftQuestion { kind: QuestionKind; prompt: string; options: string[]; required: boolean }
export interface SurveyDraft {
  id?: string
  title: string
  description: string
  anonymous: boolean
  closesOn: string
  audienceType: string
  departmentId: string | null
  branchId: string | null
  roleKey: RoleKey | null
  userIds: string[] | null
  questions: DraftQuestion[]
}

export interface QuestionResult {
  id: string; position: number; kind: QuestionKind; prompt: string; options: string[]; answered: number
  counts: Record<string, number>; ratings: Record<string, number>; average: number | null; texts: { text: string; name: string | null }[]
}
export interface SurveyResults { hidden: boolean; responses: number; recipients: number; questions?: QuestionResult[] }

export function useSurveys(organizationId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['surveys', organizationId, 'list', userId],
    enabled: Boolean(organizationId && userId),
    queryFn: async () => {
      const [{ data, error }, { data: mine, error: e2 }] = await Promise.all([
        supabase.from('surveys').select('*').eq('organization_id', organizationId!).order('created_at', { ascending: false }),
        supabase.from('survey_recipients').select('survey_id, responded_at').eq('organization_id', organizationId!).eq('user_id', userId!),
      ])
      if (error) throw error
      if (e2) throw e2
      const byId = new Map((mine ?? []).map((r) => [r.survey_id, r.responded_at]))
      return ((data ?? []) as Survey[]).map((s): SurveyWithMine => ({ ...s, i_am_recipient: byId.has(s.id), my_responded_at: byId.get(s.id) ?? null }))
    },
  })
}

export function useSurvey(id: string | undefined) {
  return useQuery({
    queryKey: ['surveys', 'one', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const [{ data: survey, error }, { data: questions, error: e2 }] = await Promise.all([
        supabase.from('surveys').select('*').eq('id', id!).maybeSingle(),
        supabase.from('survey_questions').select('*').eq('survey_id', id!).order('position'),
      ])
      if (error) throw error
      if (e2) throw e2
      return survey ? { survey: survey as Survey, questions: (questions ?? []) as SurveyQuestion[] } : null
    },
  })
}

export function useSurveyRecipients(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['surveys', 'recipients', id],
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('survey_recipients')
        .select('user_id, responded_at, reminded_at').eq('survey_id', id!)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSurveyResults(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['surveys', 'results', id],
    enabled: Boolean(id) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('survey_results', { p_id: id! })
      if (error) throw error
      return data as unknown as SurveyResults
    },
  })
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['surveys'] })
}

export function useSaveSurvey(organizationId: string | null) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (d: SurveyDraft): Promise<string> => {
      const { data, error } = await supabase.rpc('save_survey', {
        p_org: organizationId!, p_id: d.id ?? null, p_title: d.title, p_description: d.description || null, p_anonymous: d.anonymous,
        p_closes_on: d.closesOn || null, p_audience_type: d.audienceType, p_department_id: d.departmentId, p_branch_id: d.branchId,
        p_role_key: d.roleKey, p_user_ids: d.userIds, p_questions: d.questions as unknown as Json,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: invalidate,
  })
}

const rpc = <A extends Record<string, unknown>>(fn: 'send_survey' | 'submit_survey' | 'remind_survey' | 'close_survey') =>
  async (args: A) => {
    const { data, error } = await supabase.rpc(fn, args as never)
    if (error) throw error
    return data as unknown
  }

export function useSendSurvey() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => rpc('send_survey')({ p_id: id }), onSuccess: invalidate })
}
export function useSubmitSurvey() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: (v: { id: string; answers: Record<string, string | string[] | number> }) => rpc('submit_survey')({ p_id: v.id, p_answers: v.answers }),
    onSuccess: invalidate,
  })
}
export function useRemindSurvey() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: async (id: string) => (await rpc('remind_survey')({ p_id: id })) as number, onSuccess: invalidate })
}
export function useCloseSurvey() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => rpc('close_survey')({ p_id: id }), onSuccess: invalidate })
}
export function useDeleteSurvey() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('surveys').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function surveyState(s: Survey) {
  if (s.status === 'draft') return { label: 'Draft', variant: 'muted' as const }
  if (s.status === 'closed') return { label: 'Closed', variant: 'muted' as const }
  return { label: 'Open', variant: 'success' as const }
}
