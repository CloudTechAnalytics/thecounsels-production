import * as React from 'react'
import { UserPlus, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMembers } from '@/features/administration/hooks/use-administration'
import { useBranchMembers, useAssignMemberToBranch, useRemoveMemberFromBranch } from '@/features/branches/hooks/use-branches'
import type { Branch } from '@/features/branches/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function BranchMembersDialog({
  organizationId,
  branch,
  open,
  onOpenChange,
}: {
  organizationId: string
  branch: Branch | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { userId } = useAuth()
  const allMembers = useMembers(organizationId)
  const branchMembers = useBranchMembers(organizationId, branch?.id ?? null)
  const assign = useAssignMemberToBranch(organizationId)
  const remove = useRemoveMemberFromBranch(organizationId)
  const [picked, setPicked] = React.useState('')

  const assignedIds = new Set((branchMembers.data ?? []).map((m) => m.membership_id))
  const available = (allMembers.data ?? []).filter((m) => !assignedIds.has(m.id))

  const onAdd = async () => {
    if (!picked || !branch) return
    try {
      await assign.mutateAsync({ membershipId: picked, branchId: branch.id, assignedBy: userId })
      setPicked('')
    } catch (err) {
      toast.error('Could not assign member', { description: errorMessage(err) })
    }
  }

  const onRemove = async (membershipId: string) => {
    if (!branch) return
    try {
      await remove.mutateAsync({ membershipId, branchId: branch.id })
    } catch (err) {
      toast.error('Could not remove member', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{branch?.name} — members</DialogTitle>
          <DialogDescription>
            Members assigned here see this branch's matters, tasks, hearings and appointments (plus whatever's explicitly shared or assigned to them).
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Select value={picked} onValueChange={setPicked}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Add a member…" /></SelectTrigger>
            <SelectContent>
              {available.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={onAdd} disabled={!picked || assign.isPending}>
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          {branchMembers.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
          ) : branchMembers.data && branchMembers.data.length > 0 ? (
            branchMembers.data.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Avatar className="h-8 w-8">
                  {m.membership?.profile?.avatar_url && <AvatarImage src={m.membership.profile.avatar_url} alt="" />}
                  <AvatarFallback>{initialsOf(m.membership?.profile?.full_name ?? m.membership?.profile?.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.membership?.profile?.full_name ?? m.membership?.profile?.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.membership?.role?.name}</p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => onRemove(m.membership_id)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No members assigned to this branch yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
