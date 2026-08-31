import { supabase } from '@/shared/lib/supabase'
import type { AccessScope } from '@/shared/types/database.types'
import type { BranchFormValues } from '@/features/branches/schemas'
import type { Branch, BranchWithStats, BranchMemberRow } from '@/features/branches/types'

function toRow(values: BranchFormValues) {
  return {
    name: values.name.trim(),
    code: values.code?.trim() || null,
    address: values.address?.trim() || null,
    city: values.city?.trim() || null,
    state: values.state?.trim() || null,
    country: values.country?.trim() || null,
    phone: values.phone?.trim() || null,
    email: values.email?.trim() || null,
  }
}

export const branchesService = {
  async list(organizationId: string): Promise<Branch[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('*')
      .eq('organization_id', organizationId)
      .order('is_head_office', { ascending: false })
      .order('name', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  /** Adds member/matter counts per branch — two small aggregate queries
   * (member_branches, matters), combined client-side rather than a nested
   * PostgREST embed count (keeps this a plain, cheap, well-understood
   * shape rather than relying on embedded-resource count syntax). */
  async listWithStats(organizationId: string): Promise<BranchWithStats[]> {
    const [{ data: branches, error: bErr }, { data: memberRows, error: mErr }, { data: matterRows, error: matErr }] = await Promise.all([
      supabase.from('branches').select('*').eq('organization_id', organizationId).order('is_head_office', { ascending: false }).order('name'),
      supabase.from('member_branches').select('branch_id').eq('organization_id', organizationId),
      supabase.from('matters').select('branch_id').eq('organization_id', organizationId).not('branch_id', 'is', null),
    ])
    if (bErr) throw bErr
    if (mErr) throw mErr
    if (matErr) throw matErr
    const memberCounts = new Map<string, number>()
    for (const r of memberRows ?? []) memberCounts.set(r.branch_id, (memberCounts.get(r.branch_id) ?? 0) + 1)
    const matterCounts = new Map<string, number>()
    for (const r of matterRows ?? []) {
      if (!r.branch_id) continue
      matterCounts.set(r.branch_id, (matterCounts.get(r.branch_id) ?? 0) + 1)
    }
    return (branches ?? []).map((b) => ({
      ...b,
      member_count: memberCounts.get(b.id) ?? 0,
      matter_count: matterCounts.get(b.id) ?? 0,
    }))
  },

  async create(organizationId: string, values: BranchFormValues): Promise<Branch> {
    const { data, error } = await supabase
      .from('branches')
      .insert({ organization_id: organizationId, ...toRow(values) })
      .select('*')
      .single()
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'branch.created',
      p_entity_type: 'branch',
      p_entity_id: data.id,
      p_summary: `Created branch ${values.name}`,
      p_branch_id: data.id,
    })
    return data
  },

  async update(id: string, organizationId: string, values: BranchFormValues): Promise<void> {
    const { error } = await supabase.from('branches').update(toRow(values)).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'branch.updated',
      p_entity_type: 'branch',
      p_entity_id: id,
      p_summary: `Updated branch ${values.name}`,
      p_branch_id: id,
    })
  },

  async setActive(id: string, organizationId: string, name: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('branches').update({ is_active: isActive }).eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: isActive ? 'branch.reactivated' : 'branch.deactivated',
      p_entity_type: 'branch',
      p_entity_id: id,
      p_summary: `${isActive ? 'Reactivated' : 'Deactivated'} branch ${name}`,
      p_branch_id: id,
    })
  },

  /** Permanent removal — distinct from setActive's deactivate. Every
   * branch_id column outside the branches table itself is either
   * ON DELETE SET NULL (matters, tasks, hearings, documents, appointments,
   * clients, staff_profiles, log_audit) or a junction table that cascades
   * cleanly (member_branches, invitation_branches, matter_branch_shares) —
   * so this never destroys a matter/member/document, it just unassigns
   * them from the deleted branch. The head office branch is never
   * deletable (same guard the UI applies to deactivate); the caller must
   * set a different branch as head office first. */
  async remove(id: string, organizationId: string, name: string): Promise<void> {
    const { error } = await supabase.from('branches').delete().eq('id', id)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'branch.deleted',
      p_entity_type: 'branch',
      p_entity_id: id,
      p_summary: `Deleted branch ${name}`,
    })
  },

  async setHeadOffice(organizationId: string, branchId: string, name: string): Promise<void> {
    const { error } = await supabase.rpc('set_head_office', { p_org: organizationId, p_branch: branchId })
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'branch.head_office_set',
      p_entity_type: 'branch',
      p_entity_id: branchId,
      p_summary: `Set ${name} as head office`,
      p_branch_id: branchId,
    })
  },

  /** Every member assigned to a branch, across the whole org — used by the
   * branch admin panel's "Members" tab. */
  async listMembers(organizationId: string, branchId: string): Promise<BranchMemberRow[]> {
    const { data, error } = await supabase
      .from('member_branches')
      .select('*, membership:memberships(id, role:roles(id, name), profile:profiles!memberships_user_id_fkey(id, full_name, email, avatar_url))')
      .eq('organization_id', organizationId)
      .eq('branch_id', branchId)
    if (error) throw error
    return (data ?? []) as unknown as BranchMemberRow[]
  },

  async assignMember(organizationId: string, membershipId: string, branchId: string, assignedBy: string | null): Promise<void> {
    const { error } = await supabase
      .from('member_branches')
      .insert({ organization_id: organizationId, membership_id: membershipId, branch_id: branchId, assigned_by: assignedBy })
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'branch.member_assigned',
      p_entity_type: 'membership',
      p_entity_id: membershipId,
      p_summary: 'Assigned member to branch',
      p_branch_id: branchId,
    })
  },

  async removeMember(organizationId: string, membershipId: string, branchId: string): Promise<void> {
    const { error } = await supabase.from('member_branches').delete().eq('membership_id', membershipId).eq('branch_id', branchId)
    if (error) throw error
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'branch.member_removed',
      p_entity_type: 'membership',
      p_entity_id: membershipId,
      p_summary: 'Removed member from branch',
      p_branch_id: branchId,
    })
  },

  /** A membership's own current branch assignments — used to prefill the
   * access-scope/branch picker when editing an existing member. */
  async listMemberBranches(membershipId: string): Promise<string[]> {
    const { data, error } = await supabase.from('member_branches').select('branch_id').eq('membership_id', membershipId)
    if (error) throw error
    return (data ?? []).map((r) => r.branch_id)
  },

  /** Replaces a membership's branch assignments with exactly `branchIds` —
   * a delete-then-insert diff, wrapped as two calls (member_branches has no
   * "set" RPC; this table is small per-membership so the race window is
   * negligible and RLS still gates both halves). */
  async setMemberBranches(organizationId: string, membershipId: string, branchIds: string[], assignedBy: string | null): Promise<void> {
    const { error: delErr } = await supabase.from('member_branches').delete().eq('membership_id', membershipId)
    if (delErr) throw delErr
    if (branchIds.length === 0) return
    const { error: insErr } = await supabase.from('member_branches').insert(
      branchIds.map((branchId) => ({ organization_id: organizationId, membership_id: membershipId, branch_id: branchId, assigned_by: assignedBy })),
    )
    if (insErr) throw insErr
  },

  async updateMemberAccess(organizationId: string, membershipId: string, accessScope: AccessScope, branchIds: string[], assignedBy: string | null): Promise<void> {
    const { error } = await supabase.from('memberships').update({ access_scope: accessScope }).eq('id', membershipId)
    if (error) throw error
    await this.setMemberBranches(organizationId, membershipId, accessScope === 'personal' || accessScope === 'organization' ? [] : branchIds, assignedBy)
    await supabase.rpc('log_audit', {
      p_org: organizationId,
      p_action: 'membership.access_changed',
      p_entity_type: 'membership',
      p_entity_id: membershipId,
      p_summary: `Access scope changed to ${accessScope}`,
    })
  },
}
