import { usePermissions } from '@/features/auth/hooks/use-permissions'

/**
 * Where "Back to Workspace" (out of HR Workspace) should actually land.
 *
 * '/' redirects anyone without dashboard.view straight back to /hr (see
 * WorkspaceHome in router.tsx) — for an HR-only user, navigating there
 * would just bounce them right back where they started. Shared by Topbar
 * and HrSidebar so the two "Back to Workspace" affordances can't drift
 * out of sync with each other again.
 */
export function useBackToWorkspaceTarget(): string {
  const { has } = usePermissions()
  if (has('dashboard.view')) return '/'
  if (has('staff.view')) return '/staff'
  return '/notifications'
}
