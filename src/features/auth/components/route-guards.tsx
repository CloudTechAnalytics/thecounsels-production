import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { LoadingScreen } from '@/shared/components/loading-screen'
import type { PermissionKey } from '@/shared/lib/permissions'

/** Gate an entire route subtree behind an authenticated session. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated') {
    // Fresh visitors to the root see the marketing page; deep links go
    // straight to login so they return to what they were sent.
    if (location.pathname === '/') return <Navigate to="/welcome" replace />
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

/** Law-firm workspace — non-platform users, or platform staff in Support Mode. */
export function RequireOrganization() {
  const { isPlatformAdmin, supportOrgId } = useAuth()
  if (isPlatformAdmin && !supportOrgId) return <Navigate to="/platform" replace />
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
