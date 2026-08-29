import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useSubscription, usePlanFeature } from '@/features/administration/hooks/use-administration'
import { LoadingScreen } from '@/shared/components/loading-screen'
import { Button } from '@/shared/components/ui/button'
import { LandingPage } from '@/features/landing/pages/landing-page'
import type { PermissionKey } from '@/shared/lib/permissions'
import type { PlanFeatureKey } from '@/features/administration/lib/plan-features'

/** Gate an entire route subtree behind an authenticated session. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated') {
    // Fresh visitors to the root see the marketing page — rendered directly
    // in place, not a Navigate to /welcome, so the address bar stays on
    // thecounsels.org instead of visibly changing to .../welcome the
    // instant the page loads. /welcome itself still works as a real route
    // for anyone who already has that link.
    if (location.pathname === '/') return <LandingPage />
    return <Navigate to="/auth/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Redirect away from auth pages when already signed in (to the right home). */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status, isPlatformAdmin } = useAuth()
  if (status === 'loading') return <LoadingScreen />
  if (status === 'authenticated') return <Navigate to={isPlatformAdmin ? '/platform' : '/'} replace />
  return <>{children}</>
}

/** CloudTech platform console — platform admins only. Firm users are sent home. */
export function RequirePlatform() {
  const { isPlatformAdmin } = useAuth()
  if (!isPlatformAdmin) return <Navigate to="/" replace />
  return <Outlet />
}

/** Force a temp-password holder to set their own password before reaching the app. */
export function RequirePasswordChange() {
  const { profile } = useAuth()
  if (profile?.must_change_password) return <Navigate to="/auth/change-password" replace />
  return <Outlet />
}

/** Law-firm workspace — non-platform users, or platform staff in Support Mode. */
export function RequireOrganization() {
  const { isPlatformAdmin, supportOrgId } = useAuth()
  if (isPlatformAdmin && !supportOrgId) return <Navigate to="/platform" replace />
  return <Outlet />
}

/**
 * Forced stop for an expired/suspended organization — blocks the whole firm
 * workspace until organization.manage picks a plan (§6/§14). Platform staff
 * (including Support Mode, which exists precisely to help a stuck org) always
 * pass through untouched.
 */
export function RequireActiveSubscription() {
  const { activeOrgId, isPlatformAdmin } = useAuth()
  const { data: sub, isLoading } = useSubscription(isPlatformAdmin ? null : activeOrgId)

  if (isPlatformAdmin) return <Outlet />
  if (isLoading) return <LoadingScreen />
  // 'paused' was missing here — a real reported gap: the Platform Console
  // can set a subscription to any status (see platform.service.ts's
  // updateSubscription), but a paused org's own members could still use
  // the whole workspace freely, same as an active one. trialing/active/
  // past_due/cancelled are deliberately still let through (grace-period-
  // style access, not a hard lock) — only these three are meant to be a
  // full stop.
  if (sub && (sub.status === 'expired' || sub.status === 'suspended' || sub.status === 'paused')) {
    return <Navigate to="/subscription/expired" replace />
  }
  return <Outlet />
}

/**
 * The self-service onboarding wizard (/onboarding) — only for an
 * authenticated user who hasn't finished setting up a firm yet. Someone who
 * already has an active membership (setup complete, or joined via
 * invitation) is sent home instead of back through the wizard; a platform
 * admin never onboards as a firm at all.
 */
export function RequireNoOrganization() {
  const { isPlatformAdmin, memberships } = useAuth()
  if (isPlatformAdmin) return <Navigate to="/platform" replace />
  if (memberships.length > 0) return <Navigate to="/" replace />
  return <Outlet />
}

/** Guard a route by permission; renders a 403 state when unauthorized. */
export function RequirePermission({
  permission,
  mode = 'all',
  children,
}: {
  permission: PermissionKey | PermissionKey[]
  mode?: 'all' | 'any'
  children: ReactNode
}) {
  const { has, hasAny, hasAll } = usePermissions()
  const perms = Array.isArray(permission) ? permission : [permission]
  const ok = perms.length === 1 ? has(perms[0]) : mode === 'any' ? hasAny(perms) : hasAll(perms)

  if (!ok) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <p className="font-display text-2xl font-semibold">Access restricted</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          You don't have permission to view this area. Contact your firm administrator if you believe
          this is a mistake.
        </p>
      </div>
    )
  }
  return <>{children}</>
}

const PLAN_FEATURE_COPY: Record<PlanFeatureKey, { label: string; plan: string }> = {
  messaging: { label: 'Messaging', plan: 'Professional' },
  whatsapp_reminders: { label: 'WhatsApp reminders', plan: 'Professional' },
  hr_module: { label: 'HR & People Management', plan: 'Business' },
  ai_summarization: { label: 'AI matter summaries & chat', plan: 'Business' },
  appointments: { label: 'Appointments', plan: 'Business' },
}

/** Guard a route by subscription plan; same in-place "restricted" panel
 * pattern RequirePermission uses (not a redirect), with upgrade-specific
 * copy and a link to Firm Settings' Plan & Billing tab. */
export function RequirePlanFeature({ feature, children }: { feature: PlanFeatureKey; children: ReactNode }) {
  const { activeOrgId } = useAuth()
  const { has, isLoading } = usePlanFeature(activeOrgId)
  const copy = PLAN_FEATURE_COPY[feature]

  if (isLoading) return <LoadingScreen />

  if (!has(feature)) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Lock className="h-6 w-6" />
        </span>
        <p className="font-display text-2xl font-semibold">Upgrade to unlock {copy.label}</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {copy.label} is available on the {copy.plan} plan and above.
        </p>
        <Button asChild className="mt-4">
          <Link to="/administration">View plans</Link>
        </Button>
      </div>
    )
  }
  return <>{children}</>
}
