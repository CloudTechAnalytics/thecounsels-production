import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Input } from '@/shared/components/ui/input'

const NONE = '__none__'
const ALL = '__all__'

/** Single-branch picker.
 *
 * `mode`: 'form' shows a "No branch" option (matter/task/hearing/
 * appointment/client forms); 'filter' shows "All branches" (list-page
 * filters).
 *
 * `restrictToViewer`: true on every record-CREATION form (client/matter/
 * task/hearing/appointment) — the record being created should belong to
 * the CREATING user's own branch, not an open choice. False (default) for
 * admin contexts that assign a branch to someone ELSE (inviting a
 * teammate, editing a member's access) — those are governed by the
 * acting admin's permission, not their own branch membership, and must
 * stay able to pick any branch.
 *
 * With restrictToViewer on:
 * - 'organization'/'personal' scope viewers: unrestricted, same as before.
 * - 'branch' scope (exactly one branch): locked to that branch — rendered
 *   as plain read-only text, not a Select, so it can't be changed here.
 * - 'multiple_branches' scope: Select, but options narrowed to only the
 *   viewer's own assigned branches.
 */
export function BranchPicker({
  organizationId,
  value,
  onChange,
  mode = 'form',
  placeholder,
  restrictToViewer = false,
}: {
  organizationId: string | null
  value: string
  onChange: (value: string) => void
  mode?: 'form' | 'filter'
  placeholder?: string
  restrictToViewer?: boolean
}) {
  const { data: branches } = useBranches(organizationId)
  const { activeMembership } = useAuth()
  const emptyValue = mode === 'filter' ? ALL : NONE
  const emptyLabel = mode === 'filter' ? 'All branches' : 'No branch'

  const scope = activeMembership?.access_scope ?? 'organization'
  const myBranchIds = React.useMemo(
    () => new Set((activeMembership?.member_branches ?? []).map((mb) => mb.branch_id)),
    [activeMembership],
  )

  // Lock to the viewer's single branch. Only DEFAULT an empty value (a new
  // record being created) — never overwrite an already-set value, so
  // opening an existing record that happens to belong to a different
  // branch (reachable only via derived matter access) can't silently
  // reassign it just by rendering the field.
  const myBranch = restrictToViewer && scope === 'branch' ? (branches ?? []).find((b) => myBranchIds.has(b.id)) : undefined

  React.useEffect(() => {
    if (myBranch && !value) onChange(myBranch.id)
  }, [myBranch, value, onChange])

  if (myBranch) {
    const displayName = (branches ?? []).find((b) => b.id === value)?.name ?? myBranch.name
    return <Input value={displayName} disabled readOnly />
  }

  const options = (branches ?? []).filter((b) => {
    if (!(b.is_active || b.id === value)) return false
    if (restrictToViewer && scope === 'multiple_branches') return myBranchIds.has(b.id)
    return true
  })

  return (
    <Select value={value || emptyValue} onValueChange={(v) => onChange(v === emptyValue ? '' : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={emptyValue}>{emptyLabel}</SelectItem>
        {options.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
            {b.is_head_office ? ' (Head Office)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
