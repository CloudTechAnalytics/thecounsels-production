import * as React from 'react'
import { format } from 'date-fns'
import { UserPlus, MoreHorizontal, ShieldOff, KeyRound, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePlatformUsers, useCreatePlatformUser, useSetPlatformAccess } from '@/features/platform/hooks/use-platform'
import { PLATFORM_ROLES, platformRoleLabel, type PlatformUser } from '@/features/platform/types'
import { adminUsersService } from '@/shared/services/admin-users.service'
import { ResetPasswordDialog } from '@/shared/components/reset-password-dialog'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreatePlatformUser()
  const [form, setForm] = React.useState({ fullName: '', email: '', password: '', role: 'support' })
  React.useEffect(() => {
    if (open) setForm({ fullName: '', email: '', password: '', role: 'support' })
  }, [open])
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 10) {
      toast.error('Enter a name, email and a 10+ character password')
      return
    }
    try {
      await create.mutateAsync({ email: form.email.trim(), password: form.password, fullName: form.fullName.trim(), platformRole: form.role })
      toast.success('Platform user created')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not create user', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add platform user</DialogTitle>
          <DialogDescription>A CloudTech staff account — not a law-firm user. They can sign in immediately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Full name</Label><Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Temporary password</Label><Input type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="10+ characters" /></div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => set('role', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORM_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create user</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RowActions({ user }: { user: PlatformUser }) {
  const { userId } = useAuth()
  const setAccess = useSetPlatformAccess()
  const [confirmRevoke, setConfirmRevoke] = React.useState(false)
  const [resetOpen, setResetOpen] = React.useState(false)
  const isSelf = user.id === userId
  const name = user.full_name ?? user.email

  const changeRole = async (role: string) => {
    try {
      await setAccess.mutateAsync({ userId: user.id, role, isAdmin: true })
      toast.success('Role updated')
    } catch (err) {
      toast.error('Could not update role', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Actions">
            {setAccess.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Change role</DropdownMenuLabel>
          {PLATFORM_ROLES.map((r) => (
            <DropdownMenuItem key={r.key} disabled={r.key === user.platform_role} onClick={() => changeRole(r.key)}>
              {r.label}
            </DropdownMenuItem>
          ))}
          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setResetOpen(true)}>
                <KeyRound /> Reset password
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmRevoke(true)}>
                <ShieldOff /> Revoke platform access
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
          await adminUsersService.resetPassword({ userId: user.id, newPassword })
          toast.success('Password reset', { description: `${name} will be asked to set their own on next sign-in.` })
        }}
      />

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoke platform access"
        destructive
        confirmLabel="Revoke"
        loading={setAccess.isPending}
        description={<>This removes <strong>{user.full_name ?? user.email}</strong>'s access to the platform console. Their login remains but has no access.</>}
        onConfirm={async () => {
          try {
            await setAccess.mutateAsync({ userId: user.id, role: user.platform_role ?? 'support', isAdmin: false })
            toast.success('Access revoked')
            setConfirmRevoke(false)
          } catch (err) {
            toast.error('Could not revoke', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </>
  )
}

export function PlatformUsersPage() {
  const { data, isLoading } = usePlatformUsers()
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <div>
      <PageHeader
        title="Platform Users"
        description="CloudTech staff with access to this console — not law-firm users."
        actions={<Button onClick={() => setCreateOpen(true)}><UserPlus /> Add platform user</Button>}
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead><TableHead>Role</TableHead><TableHead>Last active</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {u.avatar_url && <AvatarImage src={u.avatar_url} alt="" />}
                        <AvatarFallback>{initialsOf(u.full_name ?? u.email)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{u.full_name ?? '—'}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{platformRoleLabel(u.platform_role)}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.last_seen_at ? format(new Date(u.last_seen_at), 'MMM d, yyyy') : 'Never'}</TableCell>
                  <TableCell className="text-right"><RowActions user={u} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">No platform users yet.</p>
        )}
      </Card>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
