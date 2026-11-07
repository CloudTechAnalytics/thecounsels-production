import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { Database, Json } from '@/shared/types/database.types'

export type AppraisalCycle = Database['public']['Tables']['appraisal_cycles']['Row']
export type AppraisalRow = Database['public']['Tables']['appraisals']['Row']
export type AppraisalStatus = AppraisalRow['status']
export interface Competency { name: string; description?: string }
export type CycleProgressRow = Database['public']['Functions']['appraisal_cycle_progress']['Returns'][number]

export const RATING_SCALE = [
  { value: 1, label: 'Unsatisfactory' },
  { value: 2, label: 'Needs improvement' },
  { value: 3, label: 'Meets expectations' },
  { value: 4, label: 'Exceeds expectations' },
  { value: 5, label: 'Outstanding' },
] as const
export const ratingLabel = (n: number | null | undefined) => (n ? RATING_SCALE[n - 1]?.label ?? '' : '')

export const DEFAULT_COMPETENCIES: Competency[] = [
  { name: 'Legal knowledge & technical skill', description: 'Grasp of the law and procedure in their practice area.' },
  { name: 'Quality of work', description: 'Accuracy and thoroughness of research, drafting and filings.' },
  { name: 'Client care', description: 'Responsiveness, courtesy and keeping clients informed.' },
  { name: 'Timeliness & reliability', description: 'Meets deadlines and court dates; can be relied on.' },
  { name: 'Communication', description: 'Clear writing and speaking, with colleagues, clients and the court.' },
  { name: 'Teamwork', description: 'Works well with others and shares knowledge.' },
  { name: 'Integrity & professionalism', description: 'Ethics, confidentiality and conduct.' },
  { name: 'Initiative & business development', description: 'Takes ownership, brings in or grows work.' },
]

export const RECOMMENDATIONS = [
  'No change', 'Confirmation of appointment', 'Promotion', 'Salary increase', 'Bonus', 'Training & development', 'Performance improvement plan',
] as const

export const STAGES: { key: AppraisalStatus; label: string; short: string }[] = [
  { key: 'self_review', label: 'Self-appraisal', short: 'With staff' },
  { key: 'manager_review', label: 'Line manager review', short: 'With manager' },
  { key: 'sign_off', label: 'Sign-off', short: 'Sign-off' },
  { key: 'acknowledge', label: 'Staff acknowledgement', short: 'To acknowledge' },
  { key: 'completed', label: 'Completed', short: 'Completed' },
]
export const stageIndex = (s: AppraisalStatus) => STAGES.findIndex((x) => x.key === s)

export const competenciesOf = (c: { competencies: Json } | null | undefined): Competency[] =>
  Array.isArray(c?.competencies) ? (c!.competencies as unknown as Competency[]) : []

export interface AppraisalDetail {
  viewer_role: 'self' | 'manager' | 'hr' | 'line_manager'
  appraisal: {
    id: string; organization_id: string; cycle_id: string; employee_id: string; user_id: string; branch_id: string | null
    manager_user_id: string | null; status: AppraisalStatus; employee_name: string; employee_number: string | null
    job_title: string | null; department: string | null; manager_name: string | null
    self_summary: string | null; self_overall: number | null; self_submitted_at: string | null
    manager_summary: string | null; manager_overall: number | null; manager_recommendation: string | null; manager_submitted_at: string | null
    final_rating: number | null; recommendation: string | null; sign_off_comment: string | null
    signed_off_by: string | null; signed_off_by_name: string | null; signed_off_at: string | null
    employee_agrees: boolean | null; employee_comment: string | null; employee_signed: boolean; acknowledged_at: string | null
    filed_document_id?: string | null
  }
  cycle: { id: string; name: string; period_start: string; period_end: string; self_due: string | null; manager_due: string | null; status: string; competencies: Competency[] }
  scores: { competency: number; self_rating: number | null; self_comment: string | null; manager_rating: number | null; manager_comment: string | null }[]
  goals: { id: string; title: string; self_rating: number | null; self_comment: string | null; manager_rating: number | null; manager_comment: string | null }[]
  inputs: { name: string | null; rating: number | null; comment: string; at: string }[]
}

export interface ScoreInput { competency: number; rating: number | null; comment: string }
export interface GoalInput { id?: string; title: string; rating: number | null; comment: string }

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ['appraisals'] })

export function useAppraisalCycles(organizationId: string | null) {
  return useQuery({
    queryKey: ['appraisals', organizationId, 'cycles'],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('appraisal_cycles').select('*').eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AppraisalCycle[]
    },
  })
}

export function useAppraisalCycle(id: string | undefined) {
  return useQuery({
    queryKey: ['appraisals', 'cycle', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('appraisal_cycles').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as AppraisalCycle | null
    },
  })
}

/** Appraisals the signed-in user can see (their own, their team's, or — for HR — their branches'). */
export function useAppraisals(organizationId: string | null) {
  return useQuery({
    queryKey: ['appraisals', organizationId, 'list'],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.from('appraisals')
        .select('id, organization_id, cycle_id, employee_id, user_id, branch_id, manager_user_id, status, filed_document_id, self_submitted_at, manager_submitted_at, signed_off_at, acknowledged_at, created_at, updated_at')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as AppraisalRow[]
    },
  })
}

export function useCycleProgress(cycleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['appraisals', 'progress', cycleId],
    enabled: Boolean(cycleId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('appraisal_cycle_progress', { p_cycle: cycleId! })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAppraisal(id: string | undefined) {
  return useQuery({
    queryKey: ['appraisals', 'one', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_appraisal', { p_id: id! })
      if (error) throw error
      return (data as unknown as AppraisalDetail | null) ?? null
    },
  })
}

export function useSaveCycle(organizationId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...v }: Database['public']['Tables']['appraisal_cycles']['Update'] & { id?: string; name: string; period_start: string; period_end: string }): Promise<string> => {
      if (id) {
        const { error } = await supabase.from('appraisal_cycles').update(v).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase.from('appraisal_cycles').insert({ ...v, organization_id: organizationId! }).select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('appraisal_cycles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateAll(qc),
  })
}

function useRpc<A, R = unknown>(call: (a: A) => PromiseLike<{ data: unknown; error: unknown }>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: A) => {
      const { data, error } = await call(a)
      if (error) throw error
      return data as R
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export const useLaunchCycle = () => useRpc<string, number>((id) => supabase.rpc('launch_appraisal_cycle', { p_cycle: id }))
export const useCloseCycle = () => useRpc<string>((id) => supabase.rpc('close_appraisal_cycle', { p_cycle: id }))
export const useRemindAppraisals = () => useRpc<string, number>((id) => supabase.rpc('remind_appraisals', { p_cycle: id }))

export const useSaveSelf = () => useRpc<{ id: string; scores: ScoreInput[]; goals: GoalInput[]; summary: string; overall: number | null; submit: boolean }>((v) =>
  supabase.rpc('save_self_appraisal', {
    p_id: v.id, p_scores: v.scores as unknown as Json, p_goals: v.goals as unknown as Json, p_summary: v.summary, p_overall: v.overall, p_submit: v.submit,
  }))

export const useSaveManager = () => useRpc<{ id: string; scores: ScoreInput[]; goals: GoalInput[]; summary: string; overall: number | null; recommendation: string; submit: boolean }>((v) =>
  supabase.rpc('save_manager_review', {
    p_id: v.id, p_scores: v.scores as unknown as Json, p_goals: v.goals as unknown as Json, p_summary: v.summary, p_overall: v.overall,
    p_recommendation: v.recommendation || null, p_submit: v.submit,
  }))

export const useAddInput = () => useRpc<{ id: string; rating: number | null; comment: string }>((v) =>
  supabase.rpc('add_appraisal_input', { p_id: v.id, p_rating: v.rating, p_comment: v.comment }))

export const useSignOff = () => useRpc<{ id: string; final: number | null; recommendation: string; comment: string; sendBack?: boolean }>((v) =>
  supabase.rpc('sign_off_appraisal', { p_id: v.id, p_final: v.final, p_recommendation: v.recommendation || null, p_comment: v.comment || null, p_return: v.sendBack ?? false }))

export const useAcknowledge = () => useRpc<{ id: string; agrees: boolean; comment: string; withSignature: boolean }>((v) =>
  supabase.rpc('acknowledge_appraisal', { p_id: v.id, p_agrees: v.agrees, p_comment: v.comment || null, p_with_signature: v.withSignature }))

export function useCycleMissing(cycleId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['appraisals', 'missing', cycleId],
    enabled: Boolean(cycleId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('appraisal_cycle_missing', { p_cycle: cycleId! })
      if (error) throw error
      return data ?? []
    },
  })
}
export const useAddToCycle = () => useRpc<{ cycle: string; employees: string[] }, number>((v) =>
  supabase.rpc('add_to_appraisal_cycle', { p_cycle: v.cycle, p_employee_ids: v.employees }))
export const useReassignReviewer = () => useRpc<{ id: string; reviewer: string }>((v) =>
  supabase.rpc('reassign_appraisal_reviewer', { p_id: v.id, p_reviewer: v.reviewer }))
export const useMarkFiled = () => useRpc<{ id: string; document: string }>((v) =>
  supabase.rpc('mark_appraisal_filed', { p_id: v.id, p_document: v.document }))
