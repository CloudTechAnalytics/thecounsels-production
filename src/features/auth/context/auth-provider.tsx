import * as React from 'react'
import { supabase } from '@/shared/lib/supabase'
import { PERMISSION_KEYS, type PermissionKey } from '@/shared/lib/permissions'
import { authService } from '@/features/auth/services/auth.service'
import type { ActiveMembership, AuthContextValue, AuthState } from '@/features/auth/types'
import type { Organization } from '@/shared/types/database.types'
import { toast } from '@/shared/components/ui/sonner'

const ACTIVE_ORG_KEY = 'counsel.active_org'
const SUPPORT_KEY = 'counsel.support_org'

const initialState: AuthState = {
  userId: null,
  profile: null,
  memberships: [],
  activeOrgId: null,
  activeMembership: null,
  permissions: new Set<PermissionKey>(),
  isPlatformAdmin: false,
  supportOrgId: null,
  status: 'loading',
}

/** Synthetic membership so a platform admin renders inside a firm during Support Mode. */
function supportMembership(userId: string, org: Organization): ActiveMembership {
  return {
    id: 'support-session',
    organization_id: org.id,
    user_id: userId,
    role_id: 'support',
    status: 'active',
    is_owner: false,
    title: 'Platform Support',
    invited_by: null,
    invited_at: null,
    joined_at: null,
    created_at: '',
    updated_at: '',
    role: {
      id: 'support',
      organization_id: null,
      key: null,
      name: 'Support Session',
      description: null,
      rank: 0,
      is_system: true,
      created_at: '',
      updated_at: '',
    },
    organization: org,
  } as unknown as ActiveMembership
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

function pickActiveOrg(
  memberships: ActiveMembership[],
  preferred: string | null,
  fallback: string | null,
): string | null {
  const ids = memberships.map((m) => m.organization_id)
  if (preferred && ids.includes(preferred)) return preferred
  if (fallback && ids.includes(fallback)) return fallback
  return ids[0] ?? null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(initialState)

  const load = React.useCallback(async (userId: string | null) => {
    if (!userId) {
      setState({ ...initialState, status: 'unauthenticated' })
      return
    }

    // Sign-in fires this before the profile/membership fetch below resolves.
    // Without flipping to 'loading' here, status stays stuck at the stale
    // 'unauthenticated' value for that window, and RequireAuth bounces a
    // just-signed-in user straight back to the marketing page. Skip the flip
    // when already authenticated so background token-refresh events don't
    // flash a loading screen over an active session.
    setState((prev) => (prev.status === 'authenticated' ? prev : { ...prev, status: 'loading' }))

    try {
      const [profile, memberships] = await Promise.all([
        authService.getProfile(userId),
        authService.getMemberships(userId),
      ])

      const isPlatformAdmin = Boolean(profile?.is_platform_admin)

      // Support Mode: a platform admin operating inside a firm's workspace.
      const supportOrgId = isPlatformAdmin ? sessionStorage.getItem(SUPPORT_KEY) : null
      if (supportOrgId) {
        const { data: org } = await supabase.from('organizations').select('*').eq('id', supportOrgId).single()
        if (org) {
          setState({
            userId,
            profile,
            memberships,
            activeOrgId: supportOrgId,
            activeMembership: supportMembership(userId, org as Organization),
            permissions: new Set(PERMISSION_KEYS),
            isPlatformAdmin,
            supportOrgId,
            status: 'authenticated',
          })
          void authService.touchLastSeen(userId)
          return
        }
        sessionStorage.removeItem(SUPPORT_KEY) // org vanished — drop support mode
      }

      const stored = localStorage.getItem(ACTIVE_ORG_KEY)
      const activeOrgId = pickActiveOrg(memberships, stored, profile?.default_organization_id ?? null)
      const activeMembership = memberships.find((m) => m.organization_id === activeOrgId) ?? null

      let permissions: Set<PermissionKey>
      if (isPlatformAdmin) {
        permissions = new Set(PERMISSION_KEYS)
      } else if (activeMembership) {
        permissions = new Set(await authService.getPermissionKeys(activeMembership.role_id))
      } else {
        permissions = new Set<PermissionKey>()
      }

      if (activeOrgId) localStorage.setItem(ACTIVE_ORG_KEY, activeOrgId)

      setState({
        userId,
        profile,
        memberships,
        activeOrgId,
        activeMembership,
        permissions,
        isPlatformAdmin,
        supportOrgId: null,
        status: 'authenticated',
      })

      void authService.touchLastSeen(userId)
    } catch (error) {
      // A failed fetch here must never leave status stuck at 'loading' forever —
      // surface it and fall back to signed-out so the app is usable again.
      console.error('Failed to load session profile/memberships:', error)
      toast.error('Could not load your workspace', {
        description: error instanceof Error ? error.message : 'Please try signing in again.',
      })
      setState({ ...initialState, status: 'unauthenticated' })
    }
  }, [])

  React.useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) void load(data.session?.user.id ?? null)
      })
      .catch((error) => {
        // Without this, a transient network/CORS hiccup on the very first
        // getSession() call leaves `status` stuck at 'loading' forever —
        // load() never runs, so every guarded route (RequireAuth,
        // RedirectIfAuthenticated, RequireActiveSubscription) hangs on the
        // brand loading screen indefinitely instead of settling into
        // 'unauthenticated'. Fall back the same way load()'s own catch does.
        console.error('Failed to get initial session:', error)
        if (mounted) void load(null)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') return // handled by reset-password page
      void load(session?.user.id ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [load])

  const setActiveOrg = React.useCallback(
    (orgId: string) => {
      setState((prev) => {
        const activeMembership = prev.memberships.find((m) => m.organization_id === orgId) ?? null
        localStorage.setItem(ACTIVE_ORG_KEY, orgId)
        return { ...prev, activeOrgId: orgId, activeMembership }
      })
      // Recompute permissions for the newly selected org.
      void (async () => {
        const membership = state.memberships.find((m) => m.organization_id === orgId)
        if (!membership || state.isPlatformAdmin) return
        const keys = await authService.getPermissionKeys(membership.role_id)
        setState((prev) => ({ ...prev, permissions: new Set(keys) }))
      })()
    },
    [state.memberships, state.isPlatformAdmin],
  )

  const has = React.useCallback(
    (permission: PermissionKey) => state.isPlatformAdmin || state.permissions.has(permission),
    [state.isPlatformAdmin, state.permissions],
  )
  const hasAny = React.useCallback(
    (perms: PermissionKey[]) => state.isPlatformAdmin || perms.some((p) => state.permissions.has(p)),
    [state.isPlatformAdmin, state.permissions],
  )
  const hasAll = React.useCallback(
    (perms: PermissionKey[]) => state.isPlatformAdmin || perms.every((p) => state.permissions.has(p)),
    [state.isPlatformAdmin, state.permissions],
  )

  const value = React.useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: async (email, password) => {
        await authService.signIn(email, password)
      },
      signOut: async () => {
        await authService.signOut()
      },
      signOutOtherSessions: () => authService.signOutOtherSessions(),
      signOutEverywhere: async () => {
        await authService.signOutEverywhere()
      },
      sendPasswordReset: (email) => authService.sendPasswordReset(email),
      updatePassword: async (pwd) => {
        await authService.updatePassword(pwd)
        // Refresh so a cleared must_change_password flag is reflected immediately —
        // otherwise RequirePasswordChange would bounce the user right back.
        await load(state.userId)
      },
      setActiveOrg,
      startSupport: async (orgId: string) => {
        sessionStorage.setItem(SUPPORT_KEY, orgId)
        await load(state.userId)
      },
      exitSupport: async () => {
        sessionStorage.removeItem(SUPPORT_KEY)
        sessionStorage.removeItem('counsel.support_expires')
        sessionStorage.removeItem('counsel.support_session')
        await load(state.userId)
      },
      refresh: () => load(state.userId),
      has,
      hasAny,
      hasAll,
    }),
    [state, setActiveOrg, load, has, hasAny, hasAll],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
