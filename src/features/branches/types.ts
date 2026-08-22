import type { Branch, MemberBranch, Profile } from '@/shared/types/database.types'

export type { Branch, MemberBranch }

export interface BranchWithStats extends Branch {
  member_count: number
  matter_count: number
}

export interface MemberBranchWithBranch extends MemberBranch {
  branch: Pick<Branch, 'id' | 'name' | 'code' | 'is_head_office' | 'is_active'>
}

export interface BranchMemberRow extends MemberBranch {
  membership: {
    id: string
    role: { id: string; name: string } | null
    profile: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url'> | null
  } | null
}
