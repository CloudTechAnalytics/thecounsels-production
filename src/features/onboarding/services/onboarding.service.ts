import { supabase } from '@/shared/lib/supabase'
import type { FirmSetupValues } from '@/features/onboarding/schemas'
import type { Plan } from '@/shared/types/database.types'

export interface RegistrationSettingsRow {
  id: boolean
  trial_enabled: boolean
  trial_duration_days: number
  trial_plan_id: string | null
  trial_future_price: number | null
  trial_plan: Plan | null
}

export const onboardingService = {
  /** Whether a trial is offered at all, and its default length — Platform-Console-configurable. */
  async getRegistrationSettings(): Promise<RegistrationSettingsRow> {
    const { data, error } = await supabase
      .from('registration_settings')
      .select('*, trial_plan:plans(*)')
      .eq('id', true)
      .single()
    if (error) throw error
    return data as unknown as RegistrationSettingsRow
  },

  /** The 4 plans the onboarding plan step lets a registering firm choose among. */
  async getSelectablePlans(): Promise<Plan[]> {
    const { data, error } = await supabase.from('plans').select('*').eq('is_active', true).order('sort_order')
    if (error) throw error
    return (data ?? []) as Plan[]
  },

  /**
   * Cheap, fully-derived onboarding-checklist state — no dedicated schema,
   * same "resume for free" philosophy as the rest of this feature. All four
   * counts are simple head-count queries, same shape as matters.service.ts's
   * getSummary().
   */
  async getChecklistStatus(organizationId: string): Promise<{
    teamInvited: boolean
    hasClient: boolean
    hasMatter: boolean
    hasTask: boolean
  }> {
    const [members, clients, matters, tasks] = await Promise.all([
      supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active'),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('matters').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    ])
    for (const r of [members, clients, matters, tasks]) if (r.error) throw r.error
    return {
      teamInvited: (members.count ?? 0) > 1,
      hasClient: (clients.count ?? 0) > 0,
      hasMatter: (matters.count ?? 0) > 0,
      hasTask: (tasks.count ?? 0) > 0,
    }
  },

  /** Atomic self-service org + trial + owner-membership creation. See register_organization() (migration 0054). */
  async registerOrganization(values: FirmSetupValues, planId: string) {
    const { data, error } = await supabase.rpc('register_organization', {
      p_name: values.firmName.trim(),
      p_slug: values.shortName.trim(),
      p_plan_id: planId,
      p_legal_name: values.legalName?.trim() || null,
      p_country: values.country || null,
      p_timezone: values.timezone || null,
      p_website: values.website?.trim() || null,
      p_industry: values.industry?.trim() || null,
      p_user_count: values.userCount ?? null,
      p_practice_areas: values.practiceAreas.length > 0 ? values.practiceAreas : null,
    })
    if (error) throw error
    return data
  },
}
