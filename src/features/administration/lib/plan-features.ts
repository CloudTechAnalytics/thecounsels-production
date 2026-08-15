/**
 * The small, real vocabulary of plan-gated features — mirrors what
 * migration 0100 seeds into plans.features. This is deliberately NOT the
 * old, stale PLAN_FEATURES list in the Platform Console (case_management,
 * sso, api_access, etc.) — those were never built and never checked
 * anywhere. Only these four are actually enforced, client- and
 * server-side (org_has_feature() in the DB is the real gate; this is what
 * controls what the UI *shows*, same relationship the permission system
 * has between usePermissions() and RLS).
 */
export type PlanFeatureKey = 'messaging' | 'whatsapp_reminders' | 'hr_module' | 'ai_summarization'

export function planHasFeature(features: unknown, key: PlanFeatureKey): boolean {
  return Boolean(features && typeof features === 'object' && (features as Record<string, unknown>)[key] === true)
}
