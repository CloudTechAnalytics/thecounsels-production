import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { KeyRound, Users } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMembers } from '@/features/administration/hooks/use-administration'
import { CreateUserDialog } from '@/features/administration/components/create-user-dialog'
import { adminUsersService } from '@/shared/services/admin-users.service'
import { initialsOf } from '@/shared/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ResetPasswordDialog } from '@/shared/components/reset-password-dialog'
import { toast } from '@/shared/components/ui/sonner'
import type { MemberWithRelations } from '@/features/administration/types'

function ResetPasswordAction({ member, organizationId }: { member: MemberWithRelations; organizationId: string }) {
  const [open, setOpen] = React.useState(false)
  const name = member.profile?.full_name ?? member.profile?.email ?? 'this member'

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Reset ${name}'s password`} onClick={() => setOpen(true)}>
        <KeyRound className="h-4 w-4" />
      </Button>
      <ResetPasswordDialog
        open={open}
        onOpenChange={setOpen}
        name={name}
        onSubmit={async (newPassword) => {
          await adminUsersService.resetPassword({ userId: member.user_id, newPassword, organizationId })
          toast.success('Password reset', { description: `${name} will be asked to set their own on next sign-in.` })
        }}
      />
    </>
  )
}

export function MembersPanel({ organizationId }: { organizationId: string }) {
  const members = useMembers(organizationId)
  const { has } = usePermissions()
  const { userId } = useAuth()
  const canManage = has('members.manage')

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-4 w-4 text-muted-foreground" /> Members
        </CardTitle>
        <CreateUserDialog organizationId={organizationId} />
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
                      {m.user_id !== userId && <ResetPasswordAction member={m} organizationId={organizationId} />}
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
