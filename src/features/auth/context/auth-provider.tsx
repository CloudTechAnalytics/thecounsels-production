import * as React from 'react'
import { supabase, hadAuthRedirectInUrl, isPasswordRecoveryUrl } from '@/shared/lib/supabase'
import { PERMISSION_KEYS, type PermissionKey } from '@/shared/lib/permissions'
import { authService } from '@/features/auth/services/auth.service'
import type { ActiveMembership, AuthContextValue, AuthState } from '@/features/auth/types'
import type { Organization } from '@/shared/types/database.types'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage, withTimeout } from '@/shared/lib/errors'

const ACTIVE_ORG_KEY = 'counsel.active_org'
const SUPPORT_KEY = 'counsel.support_org'
// Neither the initial session check nor the profile/membership fetch below
// may ever hang the app forever — a stalled network request (bad env vars,
// DNS, CORS, a paused Supabase project) must resolve into a visible error
// state within a bounded time, not an infinite "Loading your workspace…".
const BOOTSTRAP_TIMEOUT_MS = 15_000

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

/** A freshly-issued session's JWT can occasionally not yet be accepted by
 * PostgREST the instant sign-in resolves — a well-documented Supabase
 * eventual-consistency gotcha, not a real auth failure. Matches PostgREST's
 * own error code for it plus the common wording variants. */
function isTransientAuthError(error: unknown): boolean {
  const message = errorMessage(error)?.toLowerCase() ?? ''
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : ''
  return code === 'PGRST301' || message.includes('jwt')
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>(initialState)
  const emailConfirmHandledRef = React.useRef(false)

  const load = React.useCallback(async (userId: string | null, isRetry = false) => {
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
      const [profile, memberships] = await withTimeout(
        Promise.all([authService.getProfile(userId), authService.getMemberships(userId)]),
        BOOTSTRAP_TIMEOUT_MS,
        'Connecting to the server timed out. Check your connection and reload.',
      )

      const isPlatformAdmin = Boolean(profile?.is_platform_admin)

      // The other half of the "freshly-issued JWT" gotcha above: sometimes
      // PostgREST doesn't error on a too-fresh token, it just silently
      // evaluates auth.uid() as null for that one request — RLS then
      // filters memberships down to zero rows instead of throwing, so the
      // isTransientAuthError retry below never even runs. From here that's
      // indistinguishable from a genuinely membership-less brand-new user
      // (about to be routed to /onboarding) — retrying once costs that
      // legitimate case one harmless extra 800ms before landing on the same
      // "no memberships" result, and fixes the real bug: a just-registered
      // org's own creator intermittently landing with an empty
      // memberships/permissions state (every permission check silently
      // false — "Managing Partner can't do X" — until their next full
      // sign-in happened to land on a settled token).
      if (!isRetry && !isPlatformAdmin && memberships.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        return load(userId, true)
      }

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

      // Same "freshly-issued JWT" eventual-consistency gotcha as the
      // memberships-empty retry above, just hitting a different query: a
      // real role is never actually permission-less (every seeded role
      // gets at least dashboard.view), so an active membership somehow
      // resolving to zero permissions is a reliable enough signal this hit
      // the same race — not a real "this role can do nothing" state. Left
      // unguarded before, this produced a real reported bug: sign back in,
      // memberships load fine (so THAT retry never triggers), but every
      // permission check is silently false — every action button hidden
      // or inert — until something else (e.g. editing your own profile,
      // which calls refresh()) happens to re-run load() on a now-settled
      // token and get the real permissions.
      if (!isRetry && !isPlatformAdmin && activeMembership && permissions.size === 0) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        return load(userId, true)
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
      // A fresh sign-in occasionally hits this on the very first attempt —
      // the just-issued JWT isn't accepted by PostgREST for a brief moment
      // (see isTransientAuthError) — retrying once after a short delay
      // silently recovers instead of bouncing a just-signed-in user back to
      // login with a confusing "JWT ..." error they'd otherwise have to
      // retry manually (exactly what a second sign-in attempt was doing).
      if (!isRetry && isTransientAuthError(error)) {
        console.warn('Transient auth error loading session, retrying once:', error)
        await new Promise((resolve) => setTimeout(resolve, 800))
        return load(userId, true)
      }
      // A failed fetch here must never leave status stuck at 'loading' forever —
      // surface it and fall back to signed-out so the app is usable again.
      console.error('Failed to load session profile/memberships:', error)
      toast.error('Could not load your workspace', {
        description: errorMessage(error, 'Please try signing in again.'),
      })
      setState({ ...initialState, status: 'unauthenticated' })
    }
  }, [])

  React.useEffect(() => {
    let mounted = true

    // A password-recovery link establishes a real Supabase session before
    // this even runs (detectSessionInUrl resolves as part of client
    // construction, ahead of getSession() below) — without this check,
    // getSession() would return that session and load() would pull the
    // user's whole real account into the app's normal authenticated state
    // while they're just trying to reset a forgotten password. The
    // onAuthStateChange PASSWORD_RECOVERY guard further down catches the
    // same case for the *event*, but only if that listener happens to be
    // registered before the recovery event fires — this covers the case
    // where it isn't. updatePassword() (below) is what actually loads the
    // user in, once they've deliberately completed the reset.
    if (isPasswordRecoveryUrl) {
      // Deliberately skip getSession()->load() only — onAuthStateChange
      // still gets registered below (this effect runs once for the app's
      // whole lifetime, not per-route, so skipping it here would leave the
      // app blind to every later auth event, not just this one).
      if (mounted) setState({ ...initialState, status: 'unauthenticated' })
    } else {
      withTimeout(supabase.auth.getSession(), BOOTSTRAP_TIMEOUT_MS, 'Connecting to Supabase timed out.')
        .then(({ data }) => {
          if (mounted) void load(data.session?.user.id ?? null)
        })
        .catch((error) => {
          // Without this, a transient network/CORS hiccup (or a genuinely
          // stalled request — the timeout above guarantees this settles
          // either way) on the very first getSession() call leaves `status`
          // stuck at 'loading' forever — load() never runs, so every guarded
          // route (RequireAuth, RedirectIfAuthenticated,
          // RequireActiveSubscription) hangs on the brand loading screen
          // indefinitely instead of settling into 'unauthenticated'. Fall
          // back the same way load()'s own catch does.
          console.error('Failed to get initial session:', error)
          if (mounted) {
            toast.error('Could not connect', { description: errorMessage(error, 'Check your connection and reload.') })
            void load(null)
          }
        })
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY') return // handled by reset-password page

      // A session that appears via a URL-detected email link — not our own
      // sign-in form — must never ride straight into the app. This fires
      // regardless of which page the confirmation link actually landed on
      // (root, /auth/callback, anywhere), so it doesn't depend on Supabase's
      // Redirect URL allow-list being configured for every deployed domain.
      // A hard navigation (not react-router) is used deliberately: this
      // provider may render before/outside the router in some trees, and a
      // full reload guarantees a clean slate with no leftover URL params.
      if (event === 'SIGNED_IN' && hadAuthRedirectInUrl && !emailConfirmHandledRef.current) {
        emailConfirmHandledRef.current = true
        void (async () => {
          await authService.signOut()
          toast.success('Email verified', { description: 'Sign in to continue setting up your firm.' })
          window.location.assign('/auth/login')
        })()
        return
      }

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
      signIn: async (email, password, captchaToken) => {
        await authService.signIn(email, password, captchaToken)
      },
      signOut: async () => {
        await authService.signOut()
      },
      signOutOtherSessions: () => authService.signOutOtherSessions(),
      signOutEverywhere: async () => {
        await authService.signOutEverywhere()
      },
      sendPasswordReset: (email, captchaToken) => authService.sendPasswordReset(email, captchaToken),
      updatePassword: async (pwd) => {
        await authService.updatePassword(pwd)
        // Read the live session's user id rather than closing over
        // state.userId — on the password-recovery path (isPasswordRecoveryUrl
        // above) state.userId is deliberately still null at this point even
        // though a real (recovery) session exists, and this is exactly the
        // moment it should stop being isolated: the user just deliberately
        // completed the reset, so load them into the app now. For the
        // ordinary in-app password-change path (Settings, forced change)
        // this resolves to the same id state.userId already held — just
        // fetched fresh instead of from a closure. Also still what clears a
        // must_change_password flag immediately, same as before, so
        // RequirePasswordChange doesn't bounce the user right back.
        const { data } = await supabase.auth.getUser()
        await load(data.user?.id ?? null)
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
