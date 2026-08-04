import { supabase } from '@/shared/lib/supabase'

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
async function invokeCreate(body: Record<string, unknown>): Promise<{ userId: string; email: string }> {
  const { data, error } = await supabase.functions.invoke('admin-create-user', { body })
  if (error) {
    // Surface the function's JSON error message when present.
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json()
        throw new Error(payload.error ?? error.message)
      } catch {
        /* fall through */
      }
    }
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data as { userId: string; email: string }
}

export const adminUsersService = {
  createUser(input: CreateUserInput) {
    return invokeCreate({ ...input })
  },
  createPlatformUser(input: { email: string; password: string; fullName: string; platformRole: string }) {
    return invokeCreate({ ...input, platform: true })
  },
}
