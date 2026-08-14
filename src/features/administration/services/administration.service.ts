import { supabase } from '@/shared/lib/supabase'
import type { Organization, Plan, Role, Subscription } from '@/shared/types/database.types'
import type {
  InvitationWithRelations,
  MemberWithRelations,
  OrganizationSummary,
} from '@/features/administration/types'

export interface RoleWithPermissions {
  id: string
  name: string
  key: string | null
  description: string | null
  rank: number
  permissions: { key: string; resource: string; action: string; description: string | null }[]
}
export interface SubscriptionWithPlan extends Subscription {
  plan: Plan | null
}

export const administrationService = {
  /** Platform: every organization (RLS lets platform admins see all). */
  async listOrganizations(): Promise<OrganizationSummary[]> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*, memberships(count)')
      .order('created_at', { ascending: false })
    if (error) throw error
    const rows = (data ?? []) as unknown as (Organization & {
      memberships: { count: number }[]
    })[]
    return rows.map(({ memberships, ...rest }) => ({
      ...rest,
      member_count: memberships?.[0]?.count ?? 0,
    }))
  },

  async createOrganization(input: {
    name: string
    slug: string
    legalName?: string | null
  }): Promise<Organization> {
    const { data, error } = await supabase.rpc('create_organization', {
      p_name: input.name,
      p_slug: input.slug,
      p_legal_name: input.legalName ?? null,
    })
    if (error) throw error
    return data as Organization
  },

  /** Firm-assignable system roles (excludes platform-level roles). */
  async listAssignableRoles(): Promise<Role[]> {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('is_system', true)
      .gte('rank', 10)
      .order('rank', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async updateOrganization(
    id: string,
    patch: Partial<Pick<Organization, 'name' | 'legal_name' | 'industry' | 'website' | 'phone' | 'billing_email' | 'timezone' | 'logo_url'>>,
  ): Promise<void> {
    const { error } = await supabase.from('organizations').update(patch).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: id,
      p_action: 'organization.updated',
      p_entity_type: 'organization',
      p_entity_id: id,
      p_summary: 'Firm profile updated',
    })
  },

  /** Routed through update_organization_slug (migration 0065) rather than a
   * direct table update — it normalizes the input and gives a clean "that
   * address is taken" error instead of a raw unique-constraint violation.
   * Never touches organization_id or any other column/table. */
  async updateOrganizationSlug(organizationId: string, slug: string): Promise<Organization> {
    const { data, error } = await supabase.rpc('update_organization_slug', { p_org: organizationId, p_slug: slug })
    if (error) throw error
    return data as unknown as Organization
  },

  async uploadOrganizationLogo(organizationId: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${organizationId}/logo-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('org-logos').upload(path, file, { upsert: true, contentType: file.type || 'image/png' })
    if (upErr) throw upErr
    const url = supabase.storage.from('org-logos').getPublicUrl(path).data.publicUrl
    await this.updateOrganization(organizationId, { logo_url: url })
    return url
  },

  async getSubscription(organizationId: string): Promise<SubscriptionWithPlan | null> {
    // subscriptions has TWO foreign keys into plans (plan_id, and
    // scheduled_plan_id added in 0053) — the embed must name which one or
    // PostgREST rejects the whole query with "more than one relationship
    // was found" (HTTP 300), which is what was silently breaking this for
    // every firm login (this powers RequireActiveSubscription).
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, plan:plans!subscriptions_plan_id_fkey(*)')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (error) throw error
    return (data ?? null) as unknown as SubscriptionWithPlan | null
  },

  /** Downgrades take effect on the next billing date (schedule_plan_downgrade RPC, migration 0056) — never immediately. */
  async scheduleDowngrade(organizationId: string, planId: string): Promise<void> {
    const { error } = await supabase.rpc('schedule_plan_downgrade', { p_org: organizationId, p_plan_id: planId })
    if (error) throw error
  },

  async cancelScheduledDowngrade(organizationId: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_scheduled_downgrade', { p_org: organizationId })
    if (error) throw error
  },

  async cancelSubscription(organizationId: string, reason: string | undefined): Promise<void> {
    const { error } = await supabase.rpc('cancel_subscription', { p_org: organizationId, p_reason: reason || null })
    if (error) throw error
  },

  async listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, key, description, rank, role_permissions(permission:permissions(key, resource, action, description))')
      .eq('is_system', true)
      .gte('rank', 10)
      .order('rank', { ascending: true })
    if (error) throw error
    type Row = {
      id: string; name: string; key: string | null; description: string | null; rank: number
      role_permissions: { permission: { key: string; resource: string; action: string; description: string | null } | null }[]
    }
    return ((data ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      description: r.description,
      rank: r.rank,
      permissions: r.role_permissions.map((rp) => rp.permission).filter(Boolean) as RoleWithPermissions['permissions'],
    }))
  },

  async removeMember(membershipId: string, organizationId: string, name: string): Promise<void> {
    const { error } = await supabase.from('memberships').delete().eq('id', membershipId)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'member.removed',
      p_entity_type: 'membership',
      p_entity_id: membershipId,
      p_summary: `Removed ${name} from the firm`,
    })
  },

  /** Suspend blocks sign-in without deleting anything they authored (tasks,
   * documents, audit history stay attached to their name) — the reversible
   * option for "this person shouldn't have access right now," as opposed
   * to removeMember's permanent removal. */
  async setMembershipStatus(
    membershipId: string,
    organizationId: string,
    status: 'active' | 'suspended',
    name: string,
  ): Promise<void> {
    const { error } = await supabase.from('memberships').update({ status }).eq('id', membershipId)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: status === 'suspended' ? 'member.suspended' : 'member.reactivated',
      p_entity_type: 'membership',
      p_entity_id: membershipId,
      p_summary: `${status === 'suspended' ? 'Suspended' : 'Reactivated'} ${name}`,
    })
  },

  async listInvitations(organizationId: string): Promise<InvitationWithRelations[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*, role:roles(id, name, key)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as InvitationWithRelations[]
  },

  async createInvitation(input: {
    organizationId: string
    email: string
    roleId: string
    message?: string | null
  }): Promise<void> {
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('invitations').insert({
      organization_id: input.organizationId,
      email: input.email.toLowerCase(),
      role_id: input.roleId,
      message: input.message ?? null,
      invited_by: userData.user?.id ?? null,
    })
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: input.organizationId,
      p_action: 'invitation.created',
      p_entity_type: 'invitation',
      p_summary: `Invited ${input.email}`,
    })
  },

  async revokeInvitation(id: string): Promise<void> {
    const { error } = await supabase.from('invitations').update({ status: 'revoked' }).eq('id', id)
    if (error) throw error
  },

  async listMembers(organizationId: string): Promise<MemberWithRelations[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select(
        '*, profile:profiles!memberships_user_id_fkey(id, full_name, email, avatar_url, title), role:roles(id, name, key, rank)',
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as MemberWithRelations[]
  },

  /** Pending invitations addressed to the signed-in user's email. */
  async listMyPendingInvitations(): Promise<InvitationWithRelations[]> {
    const { data, error } = await supabase
      .from('invitations')
      .select('*, role:roles(id, name, key), organization:organizations(id, name, slug)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as unknown as InvitationWithRelations[]
  },
}
