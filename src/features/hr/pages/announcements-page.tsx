import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Megaphone, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useAnnouncements, useSendAnnouncement, useUpdateAnnouncement, useDeleteAnnouncement,
  useDepartments, useEmployees,
} from '@/features/hr/hooks/use-hr'
import { ANNOUNCEMENT_AUDIENCES, type HrAnnouncementRow } from '@/features/hr/types'
import { ROLE_META } from '@/shared/lib/permissions'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'

const ROLE_OPTIONS = Object.entries(ROLE_META)
  .filter(([key]) => key !== 'platform_owner' && key !== 'platform_admin')
  .sort(([, a], [, b]) => a.rank - b.rank)
  .map(([key, meta]) => ({ key, label: meta.label }))
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

function ComposeDialog() {
  const { activeOrgId } = useAuth()
  const { data: departments } = useDepartments(activeOrgId)
  const { data: employees } = useEmployees(activeOrgId)
  const send = useSendAnnouncement(activeOrgId)
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')
  const [audienceType, setAudienceType] = React.useState('organization')
  const [departmentId, setDepartmentId] = React.useState('')
  const [userIds, setUserIds] = React.useState<string[]>([])
  const [branch, setBranch] = React.useState('')
  const [roleKey, setRoleKey] = React.useState('')

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error('Add a title and message')
      return
    }
    try {
      await send.mutateAsync({
        title: title.trim(), body: body.trim(), audienceType,
        departmentId: departmentId || undefined,
        userIds: userIds.length > 0 ? userIds : undefined,
        branch: branch.trim() || undefined,
        roleKey: roleKey || undefined,
      })
      toast.success('Announcement sent')
      setOpen(false)
      setTitle(''); setBody(''); setUserIds([]); setDepartmentId(''); setBranch(''); setRoleKey('')
    } catch (err) {
      toast.error('Could not send', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New announcement</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
          <DialogDescription>Sends an in-app notification to everyone in the chosen audience.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office Closure — Independence Day" />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Select value={audienceType} onValueChange={setAudienceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANNOUNCEMENT_AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {audienceType === 'role' && (
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={roleKey} onValueChange={setRoleKey}>
                <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {audienceType === 'department' && (
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue placeholder="Choose a department" /></SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {audienceType === 'branch' && (
            <div className="space-y-1.5">
              <Label>Branch/location</Label>
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="e.g. Lagos office" />
            </div>
          )}
          {audienceType === 'employees' && (
            <div className="space-y-1.5">
              <Label>Employees</Label>
              <select
                multiple
                value={userIds}
                onChange={(e) => setUserIds(Array.from(e.target.selectedOptions, (o) => o.value))}
                className="h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {employees?.map((emp) => <option key={emp.userId} value={emp.userId}>{emp.fullName ?? emp.email}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">Ctrl/Cmd-click to select more than one.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={send.isPending}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Title/body only — audience isn't editable after the fact, since
 * notifications already went to the original recipients at send time. */
function EditDialog({ announcement, open, onOpenChange }: { announcement: HrAnnouncementRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId } = useAuth()
  const update = useUpdateAnnouncement(activeOrgId)
  const [title, setTitle] = React.useState('')
  const [body, setBody] = React.useState('')

  React.useEffect(() => {
    if (open && announcement) {
      setTitle(announcement.title)
      setBody(announcement.body)
    }
  }, [open, announcement])

  const submit = async () => {
    if (!announcement) return
    if (!title.trim() || !body.trim()) {
      toast.error('Add a title and message')
      return
    }
    try {
      await update.mutateAsync({ id: announcement.id, values: { title: title.trim(), body: body.trim() } })
      toast.success('Announcement updated')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not update', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit announcement</DialogTitle>
          <DialogDescription>The audience it was sent to can't be changed after the fact.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AnnouncementsPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: announcements, isLoading } = useAnnouncements(activeOrgId)
  const del = useDeleteAnnouncement(activeOrgId)
  const canManage = has('hr_announcements.manage')
  const [editing, setEditing] = React.useState<HrAnnouncementRow | null>(null)
  const [toDelete, setToDelete] = React.useState<HrAnnouncementRow | null>(null)

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Firm-wide and targeted communications from HR."
        actions={canManage ? <ComposeDialog /> : undefined}
      />
      <div className="space-y-3">
        {isLoading ? (
          <Card className="h-24 animate-pulse" />
        ) : announcements && announcements.length > 0 ? (
          announcements.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Megaphone className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold">{a.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(a)} aria-label="Edit announcement">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setToDelete(a)} aria-label="Delete announcement"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))
        ) : (
          <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Megaphone className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          </Card>
        )}
      </div>

      <EditDialog announcement={editing} open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete announcement"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This removes <strong>{toDelete?.title}</strong> for good. It won't un-notify anyone who already received it.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync(toDelete.id)
            toast.success('Announcement deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: errorMessage(err) })
          }
        }}
      />
    </div>
  )
}
