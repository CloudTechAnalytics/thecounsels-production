import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'

/** Drives the dashboard's (and, wherever reused, list pages'/reports')
 * branch selector. A user only sees the selector at all when they can
 * actually see more than one branch — 'organization' scope with >1 real
 * branch in the org, or 'multiple_branches' scope with >1 assignment.
 * Selecting a specific branch is a pure client-side filter on top of
 * whatever RLS already authorizes — omitting it ("All branches") relies
 * on RLS alone, never widens what's visible. */
export function useBranchScope() {
  const { activeOrgId, activeMembership } = useAuth()
  const { data: orgBranches } = useBranches(activeOrgId)
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>('')

  const scope = activeMembership?.access_scope ?? 'organization'
  const assignedBranches = activeMembership?.member_branches ?? []

  const options = React.useMemo(() => {
    if (scope === 'organization') return (orgBranches ?? []).filter((b) => b.is_active)
    if (scope === 'multiple_branches') return assignedBranches.map((mb) => mb.branch).filter((b): b is NonNullable<typeof b> => Boolean(b))
    return []
  }, [scope, orgBranches, assignedBranches])

  return {
    /** Only worth rendering a selector when there's a real choice. */
    canSelect: options.length > 1,
    options,
    selectedBranchId,
    setSelectedBranchId,
  }
}
