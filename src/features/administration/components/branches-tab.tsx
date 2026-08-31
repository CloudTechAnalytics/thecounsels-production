import * as React from 'react'
import { Plus, Building2 } from 'lucide-react'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useBranchesWithStats, useSetBranchActive, useSetHeadOffice, useDeleteBranch } from '@/features/branches/hooks/use-branches'
import { BranchFormDialog } from '@/features/branches/components/branch-form-dialog'
import { BranchMembersDialog } from '@/features/branches/components/branch-members-dialog'
import { BranchCard } from '@/features/branches/components/branch-card'
import type { Branch, BranchWithStats } from '@/features/branches/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function BranchesTab({ organizationId }: { organizationId: string }) {
  const { has } = usePermissions()
  const canManage = has('branches.manage')
  const { data: branches, isLoading } = useBranchesWithStats(organizationId)
  const setActive = useSetBranchActive(organizationId)
  const setHeadOffice = useSetHeadOffice(organizationId)
  const deleteBranch = useDeleteBranch(organizationId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Branch | null>(null)
  const [membersFor, setMembersFor] = React.useState<Branch | null>(null)
  const [deleting, setDeleting] = React.useState<BranchWithStats | null>(null)

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (b: BranchWithStats) => {
    setEditing(b)
    setFormOpen(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Branches
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Physical offices within your firm, and who has access to each.</p>
        </div>
        {canManage && (
          <Button onClick={openNew}>
            <Plus /> Add branch
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : branches && branches.length > 0 ? (
          branches.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              canManage={canManage}
              onEdit={() => openEdit(b)}
              onViewMembers={() => setMembersFor(b)}
              onSetHeadOffice={async () => {
                try {
                  await setHeadOffice.mutateAsync({ branchId: b.id, name: b.name })
                  toast.success(`${b.name} is now the head office`)
                } catch (err) {
                  toast.error('Could not set head office', { description: errorMessage(err) })
                }
              }}
              onToggleActive={async () => {
                try {
                  await setActive.mutateAsync({ id: b.id, name: b.name, isActive: !b.is_active })
                  toast.success(b.is_active ? `${b.name} deactivated` : `${b.name} reactivated`)
                } catch (err) {
                  toast.error('Could not update branch', { description: errorMessage(err) })
                }
              }}
              onDelete={() => setDeleting(b)}
            />
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No branches yet.</p>
        )}
      </CardContent>

      <BranchFormDialog organizationId={organizationId} branch={editing} open={formOpen} onOpenChange={setFormOpen} />
      <BranchMembersDialog organizationId={organizationId} branch={membersFor} open={Boolean(membersFor)} onOpenChange={(o) => !o && setMembersFor(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete branch"
        destructive
        confirmPhrase="DELETE"
        confirmLabel="Delete"
        loading={deleteBranch.isPending}
        description={
          deleting ? (
            <>
              {deleting.name} will be permanently deleted. This does not delete any members, matters, or documents — they'll just
              no longer be assigned to this branch.
              {(deleting.member_count > 0 || deleting.matter_count > 0) && (
                <> Currently has {deleting.member_count} {deleting.member_count === 1 ? 'member' : 'members'} and {deleting.matter_count}{' '}
                  {deleting.matter_count === 1 ? 'matter' : 'matters'} assigned.</>
              )}
            </>
          ) : null
        }
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteBranch.mutateAsync({ id: deleting.id, name: deleting.name })
            toast.success(`${deleting.name} deleted`)
            setDeleting(null)
          } catch (err) {
            toast.error('Could not delete branch', { description: errorMessage(err) })
          }
        }}
      />
    </Card>
  )
}
