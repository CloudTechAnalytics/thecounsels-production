import type { MembershipStatus, Organization, Plan, Subscription } from '@/shared/types/database.types'

export interface MemberDirectoryRow {
  id: string
  status: MembershipStatus
  is_owner: boolean
  title: string | null
  created_at: string
  user: { id: string; full_name: string | null; email: string; avatar_url: string | null; last_seen_at: string | null } | null
  organization: { id: string; name: string; slug: string } | null
  role: { id: string; name: string; key: string | null } | null
}

export interface SubscriptionWithPlan extends Subscription {
  plan: Plan | null
}

export interface OrgRow extends Organization {
  member_count: number
  subscription: SubscriptionWithPlan | null
}

export interface RegistrationSettings {
  id: boolean
  trial_enabled: boolean
  trial_duration_days: number
  trial_plan_id: string | null
  trial_future_price: number | null
  updated_at: string
}

export interface SubscriptionRow extends Subscription {
  plan: Plan | null
  organization: Pick<Organization, 'id' | 'name' | 'slug' | 'logo_url' | 'status'> | null
}

export interface PlatformStats {
  totalOrganizations: number
  paidOrganizations: number
  trialOrganizations: number
  suspendedOrganizations: number
  totalUsers: number
  platformUsers: number
  organizationsThisMonth: number
  auditEvents: number
  signedInToday: number
  mrr: number
  arr: number
}

export interface GrowthPoint {
  label: string
  value: number
}

export interface RevenueAnalytics {
  mrr: number
  arr: number
  arpa: number
  payingCustomers: number
  atRisk: number
  projectedArr: number
  trend: GrowthPoint[]
  movement: { label: string; newMrr: number; churnedMrr: number; netMrr: number }[]
  byPlan: { label: string; value: number; customers: number }[]
  byCycle: { label: string; value: number }[]
  topCustomers: { id: string; name: string; plan: string; mrr: number }[]
  forecast: { label: string; value: number }[]
}

export interface PlatformUser {
  id: string
  full_name: string | null
  email: string
  avatar_url: string | null
  platform_role: string | null
  last_seen_at: string | null
  created_at: string
}

export const PLATFORM_ROLES: { key: string; label: string }[] = [
  { key: 'owner', label: 'Platform Owner' },
  { key: 'admin', label: 'Administrator' },
  { key: 'support', label: 'Support Engineer' },
  { key: 'sales', label: 'Sales' },
  { key: 'developer', label: 'Developer' },
  { key: 'finance', label: 'Finance' },
]

export function platformRoleLabel(key: string | null): string {
  return PLATFORM_ROLES.find((r) => r.key === key)?.label ?? 'Administrator'
}

/** Canonical plan feature flags (used by the Plans editor). */
export const PLAN_FEATURES: { key: string; label: string }[] = [
  { key: 'case_management', label: 'Case Management' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'reports_basic', label: 'Basic Reports' },
  { key: 'reports_advanced', label: 'Advanced Reports' },
  { key: 'billing', label: 'Billing' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'document_versioning', label: 'Document Versioning' },
  { key: 'ai_features', label: 'AI Features' },
  { key: 'custom_branding', label: 'Custom Branding' },
  { key: 'sso', label: 'SSO' },
  { key: 'audit_logs', label: 'Audit Logs' },
  { key: 'api_access', label: 'API Access' },
  { key: 'advanced_security', label: 'Advanced Security' },
]
