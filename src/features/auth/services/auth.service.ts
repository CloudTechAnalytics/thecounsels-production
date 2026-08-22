import { supabase } from '@/shared/lib/supabase'
import type { PermissionKey } from '@/shared/lib/permissions'
import type { Profile } from '@/shared/types/database.types'
import type { ActiveMembership } from '@/features/auth/types'

/** Authentication + identity data access. The app's only backend is Supabase. */
export const authService = {
  async getSessionUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.user.id ?? null
  },

  async signIn(email: string, password: string, captchaToken?: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    })
    if (error) throw error
  },

  /**
   * Register a new account (public self-service entry point, /auth/register).
   * Access is still gated by organization membership — a fresh, verified
   * account has no memberships until it either completes /onboarding
   * (creating its own firm) or accepts an invitation. Returns whether a
   * session was established immediately (email confirmation disabled) or an
   * email must be confirmed first — confirmation is on by default (see
   * supabase/config.toml), so this is normally `true`.
   */
  async signUp(
    email: string,
    password: string,
    fullName: string,
    captchaToken?: string,
  ): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    })
    if (error) throw error
    return { needsConfirmation: !data.session }
  },

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  /** Revoke every session but this one — the other devices' refresh tokens stop working. */
  async signOutOtherSessions(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) throw error
  },

  /** Revoke this session too, ending in a normal sign-out redirect. */
  async signOutEverywhere(): Promise<void> {
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) throw error
  },

  async sendPasswordReset(email: string, captchaToken?: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
      ...(captchaToken ? { captchaToken } : {}),
    })
    if (error) throw error
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
    // Setting a real password (forced change, or a normal recovery reset)
    // always satisfies the "must change" requirement, if one was set.
    const { data } = await supabase.auth.getUser()
    if (data.user) {
      await supabase.from('profiles').update({ must_change_password: false }).eq('id', data.user.id)
    }
  },

  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async getMemberships(userId: string): Promise<ActiveMembership[]> {
    const { data, error } = await supabase
      .from('memberships')
      .select('*, role:roles(*), organization:organizations(*), member_branches(branch_id, branch:branches(*))')
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error) throw error
    return (data ?? []) as unknown as ActiveMembership[]
  },

  async getPermissionKeys(roleId: string): Promise<PermissionKey[]> {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('permission:permissions(key)')
      .eq('role_id', roleId)
    if (error) throw error
    return (data ?? [])
      .map((row) => (row as { permission: { key: string } | null }).permission?.key)
      .filter((k): k is PermissionKey => Boolean(k))
  },

  async touchLastSeen(userId: string): Promise<void> {
    await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId)
  },

  async acceptInvitation(token: string): Promise<void> {
    const { error } = await supabase.rpc('accept_invitation', { p_token: token })
    if (error) throw error
  },
}
