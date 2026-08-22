import type { Invitation, Membership, Organization, Profile, Role } from '@/shared/types/database.types'

export interface InvitationWithRelations extends Invitation {
  role: Pick<Role, 'id' | 'name' | 'key'> | null
  organization?: Pick<Organization, 'id' | 'name' | 'slug'> | null
}

export interface MemberWithRelations extends Membership {
  profile: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'title'> | null
  role: Pick<Role, 'id' | 'name' | 'key' | 'rank'> | null
  member_branches: { branch_id: string; branch: { id: string; name: string } | null }[]
}

export interface OrganizationSummary extends Organization {
  member_count: number
}
