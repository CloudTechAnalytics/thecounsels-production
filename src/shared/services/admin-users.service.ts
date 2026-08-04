import { invokeEdgeFunction } from '@/shared/lib/edge-function'

export interface CreateUserInput {
  email: string
  password: string
  fullName: string
  organizationId: string
  roleKey: string
  title?: string
  /** True only when a Platform Admin is seating an org's first admin as part of creating the organization. */
  platformSeed?: boolean
}

/**
 * Create a user account via the admin-create-user Edge Function (service role).
 * Used by Platform Admins (to create an organization's admin) and by
 * organization admins (to create their firm's users). Public signup is disabled.
 */
function invokeCreate(body: Record<string, unknown>): Promise<{ userId: string; email: string }> {
  return invokeEdgeFunction('admin-create-user', body)
}

export const adminUsersService = {
  createUser(input: CreateUserInput) {
    return invokeCreate({ ...input })
  },
  createPlatformUser(input: { email: string; password: string; fullName: string; platformRole: string }) {
    return invokeCreate({ ...input, platform: true })
  },
  /**
   * Admin-assisted reset — sets someone else's password directly, bypassing
   * email. Omit organizationId to reset a platform staff account.
   */
  resetPassword(input: { userId: string; newPassword: string; organizationId?: string }): Promise<{ userId: string }> {
    return invokeEdgeFunction('admin-reset-password', { ...input })
  },
}
