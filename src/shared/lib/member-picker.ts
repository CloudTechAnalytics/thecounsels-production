import type { MemberWithRelations } from '@/features/administration/types'

/** True if this member should show up as a lawyer/partner pick for the
 * given branch — org-wide access_scope members are always eligible
 * (leadership), otherwise they need that branch specifically assigned.
 * No branch picked yet ("") shows everyone, same permissive default the
 * BranchPicker itself uses before a choice is made. Shared by the
 * Matter and Hearing forms (0140) so branch-filtered lawyer/partner
 * pickers stay consistent rather than drifting apart. */
export function memberInBranch(member: Pick<MemberWithRelations, 'access_scope' | 'member_branches'>, branchId: string): boolean {
  if (!branchId) return true
  return member.access_scope === 'organization' || member.member_branches.some((mb) => mb.branch_id === branchId)
}

/** Name plus their title (or role, when no custom title is set) — so a
 * lawyer/partner picker shows who someone actually is, not just a bare
 * name in a long list. */
export function memberLabel(m: Pick<MemberWithRelations, 'profile' | 'role'>): string {
  const name = m.profile?.full_name ?? m.profile?.email ?? 'Unknown'
  const sub = m.profile?.title || m.role?.name
  return sub ? `${name} — ${sub}` : name
}
