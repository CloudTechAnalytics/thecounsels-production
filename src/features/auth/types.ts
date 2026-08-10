import type {
  Membership,
  Organization,
  Profile,
  Role,
} from '@/shared/types/database.types'
import type { PermissionKey } from '@/shared/lib/permissions'

/** A membership joined with its role and organization. */
export interface ActiveMembership extends Membership {
  role: Role
  organization: Organization
}

export interface AuthState {
  /** Supabase user id, or null when signed out. */
  userId: string | null
  profile: Profile | null
  memberships: ActiveMembership[]
  activeOrgId: string | null
  activeMembership: ActiveMembership | null
  /** Permission keys granted in the active organization. */
  permissions: Set<PermissionKey>
  isPlatformAdmin: boolean
  /** Set when a platform admin is inside a firm via Support Mode. */
  supportOrgId: string | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
}

export interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string, captchaToken?: string) => Promise<void>
  signOut: () => Promise<void>
  /** Revoke every other session, keeping this device signed in. */
  signOutOtherSessions: () => Promise<void>
  /** Revoke every session including this one. */
  signOutEverywhere: () => Promise<void>
  sendPasswordReset: (email: string, captchaToken?: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  setActiveOrg: (orgId: string) => void
  /** Enter a firm's workspace in Support Mode (platform staff only). */
  startSupport: (orgId: string) => Promise<void>
  /** Leave Support Mode and return to the platform console. */
  exitSupport: () => Promise<void>
  refresh: () => Promise<void>
  has: (permission: PermissionKey) => boolean
  hasAny: (permissions: PermissionKey[]) => boolean
  hasAll: (permissions: PermissionKey[]) => boolean
}
