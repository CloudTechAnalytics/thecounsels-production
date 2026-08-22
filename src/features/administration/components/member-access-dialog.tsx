import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMemberBranches, useUpdateMemberAccess } from '@/features/branches/hooks/use-branches'
import { BranchPicker } from '@/features/branches/components/branch-picker'
import { BranchMultiToggle } from '@/features/branches/components/branch-multi-toggle'
import type { MemberWithRelations } from '@/features/administration/types'
import type { AccessScope } from '@/shared/types/database.types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const ACCESS_SCOPE_META: Record<AccessScope, { label: string; description: string }> = {
  organization: { label: 'Organization-wide', description: 'Sees everything across every branch.' },
  branch: { label: 'Single branch', description: 'Sees only their assigned branch.' },
  multiple_branches: { label: 'Multiple branches', description: 'Sees only their assigned branches.' },
  personal: { label: "Personal only", description: "Sees only what's explicitly assigned to them." },
}

/** Edit an existing member's access scope + branch assignment(s) — role
 * itself isn't editable here (no existing role-change surface in the app
 * to hook into safely; out of scope for the branch-access work). */
export function MemberAccessDialog({
  organizationId,
  member,
  open,
  onOpenChange,
}: {
  organizationId: string
  member: MemberWithRelations | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { userId } = useAuth()
  const { data: currentBranches } = useMemberBranches(member?.id ?? null)
  const update = useUpdateMemberAccess(organizationId)
  const [scope, setScope] = React.useState<AccessScope>('organization')
  const [branchId, setBranchId] = React.useState('')
  const [branchIds, setBranchIds] = React.useState<string[]>([])

  React.useEffect(() => {
    if (open && member) {
      setScope(member.access_scope)
      const ids = currentBranches ?? []
      setBranchId(ids[0] ?? '')
      setBranchIds(ids)
    }
  }, [open, member, currentBranches])

  const onSave = async () => {
    if (!member) return
    try {
      await update.mutateAsync({
        membershipId: member.id,
        accessScope: scope,
        branchIds: scope === 'branch' ? (branchId ? [branchId] : []) : scope === 'multiple_branches' ? branchIds : [],
        assignedBy: userId,
      })
      toast.success('Access updated')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not update access', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit access — {member?.profile?.full_name ?? member?.profile?.email}</DialogTitle>
          <DialogDescription>Where this person can see and act, independent of their role.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Select value={scope} onValueChange={(v) => setScope(v as AccessScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACCESS_SCOPE_META).map(([v, meta]) => (
                  <SelectItem key={v} value={v}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ACCESS_SCOPE_META[scope].description}</p>
          </div>

          {scope === 'branch' && <BranchPicker organizationId={organizationId} value={branchId} onChange={setBranchId} mode="form" />}
          {scope === 'multiple_branches' && <BranchMultiToggle organizationId={organizationId} value={branchIds} onChange={setBranchIds} />}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} loading={update.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
