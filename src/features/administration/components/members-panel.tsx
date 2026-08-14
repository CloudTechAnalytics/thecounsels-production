import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { KeyRound, Users, MoreHorizontal, Ban, RotateCcw, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMembers, useSubscription, useSetMembershipStatus, useRemoveMember } from '@/features/administration/hooks/use-administration'
import { CreateUserDialog } from '@/features/administration/components/create-user-dialog'
import { adminUsersService } from '@/shared/services/admin-users.service'
import { initialsOf } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ResetPasswordDialog } from '@/shared/components/reset-password-dialog'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { toast } from '@/shared/components/ui/sonner'
import type { MemberWithRelations } from '@/features/administration/types'

/** Reset password + suspend/reactivate + remove, in one menu. Suspend/
 * remove are hidden entirely for the org's owner — this UI has no
 * ownership-transfer flow, so it must never let anyone lock out or delete
 * the one account guaranteed to still have access. */
function MemberActionsMenu({ member, organizationId }: { member: MemberWithRelations; organizationId: string }) {
  const [resetOpen, setResetOpen] = React.useState(false)
  const [confirmSuspend, setConfirmSuspend] = React.useState(false)
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const setStatus = useSetMembershipStatus(organizationId)
  const remove = useRemoveMember(organizationId)
  const name = member.profile?.full_name ?? member.profile?.email ?? 'this member'
  const suspended = member.status === 'suspended'

  const toggleSuspend = async () => {
    try {
      await setStatus.mutateAsync({ membershipId: member.id, status: suspended ? 'active' : 'suspended', name })
      toast.success(suspended ? `${name} reactivated` : `${name} suspended`, {
        description: suspended ? 'They can sign in again.' : 'They can no longer sign in, but nothing they created was touched.',
      })
      setConfirmSuspend(false)
    } catch (err) {
      toast.error('Action failed', { description: errorMessage(err) })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setResetOpen(true)}>
            <KeyRound className="h-4 w-4" /> Reset password
          </DropdownMenuItem>
          {!member.is_owner && (
            <>
              <DropdownMenuSeparator />
              {suspended ? (
                <DropdownMenuItem onClick={toggleSuspend}>
                  <RotateCcw className="h-4 w-4" /> Reactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmSuspend(true)}>
                  <Ban className="h-4 w-4" /> Suspend
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="h-4 w-4" /> Remove from firm
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResetPasswordDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        name={name}
        onSubmit={async (newPassword) => {
          await adminUsersService.resetPassword({ userId: member.user_id, newPassword, organizationId })
          toast.success('Password reset', { description: `${name} will be asked to set their own on next sign-in.` })
        }}
      />

      <ConfirmDialog
        open={confirmSuspend}
        onOpenChange={setConfirmSuspend}
        title="Suspend member"
        destructive
        confirmLabel="Suspend"
        loading={setStatus.isPending}
        description={<>{name} will immediately lose the ability to sign in. Nothing they created (matters, documents, time entries) is affected, and this is fully reversible.</>}
        onConfirm={toggleSuspend}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove from firm"
        destructive
        confirmPhrase="REMOVE"
        confirmLabel="Remove"
        loading={remove.isPending}
        description={<>{name} will permanently lose access to this firm's workspace. This does not delete their account or anything they created — only their membership here.</>}
        onConfirm={async () => {
          try {
            await remove.mutateAsync({ membershipId: member.id, name })
            toast.success(`${name} removed from the firm`)
            setConfirmRemove(false)
          } catch (err) {
            toast.error('Could not remove', { description: errorMessage(err) })
          }
        }}
      />
    </>
  )
}

export function MembersPanel({
  organizationId,
  onNavigateToPlan,
}: {
  organizationId: string
  /** Switches Firm Settings to the Plan & Billing tab — parent owns tab state. */
  onNavigateToPlan?: () => void
}) {
  const members = useMembers(organizationId)
  const subscription = useSubscription(organizationId)
  const { has } = usePermissions()
  const { userId } = useAuth()
  const canManage = has('members.manage')

  const activeCount = members.data?.filter((m) => m.status === 'active').length ?? 0
  const seats = subscription.data?.seats ?? null
  const atLimit = seats != null && activeCount >= seats
  const planName = subscription.data?.plan?.name ?? 'current'

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-4 w-4 text-muted-foreground" /> Members
          </CardTitle>
          {seats != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {activeCount} of {seats} seats used
            </p>
          )}
        </div>
        {atLimit ? (
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" onClick={onNavigateToPlan} disabled={!onNavigateToPlan}>
              Upgrade plan
            </Button>
            <p className="text-xs text-muted-foreground">
              You've reached the {seats}-user limit on your {planName} plan.
            </p>
          </div>
        ) : (
          <CreateUserDialog organizationId={organizationId} />
        )}
      </CardHeader>
      <CardContent>
        {members.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : members.data && members.data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                {canManage && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {m.profile?.avatar_url && <AvatarImage src={m.profile.avatar_url} alt="" />}
                        <AvatarFallback>{initialsOf(m.profile?.full_name ?? m.profile?.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.profile?.full_name ?? '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{m.role?.name ?? '—'}</span>
                      {m.is_owner && <Badge variant="default">Owner</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === 'active' ? 'success' : 'muted'}>{m.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {m.joined_at ? formatDistanceToNow(new Date(m.joined_at), { addSuffix: true }) : '—'}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      {m.user_id !== userId && <MemberActionsMenu member={m} organizationId={organizationId} />}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No members yet. Add your first user to get started.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
