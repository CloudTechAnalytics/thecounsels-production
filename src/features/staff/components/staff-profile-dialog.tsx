import * as React from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Camera, Loader2, UserMinus } from 'lucide-react'
import { useUpsertStaffProfile, useUploadAvatar } from '@/features/staff/hooks/use-staff'
import { useRemoveMember } from '@/features/administration/hooks/use-administration'
import { staffProfileSchema, type StaffProfileFormValues } from '@/features/staff/schemas'
import { AVAILABILITY_OPTIONS, AVAILABILITY_META } from '@/features/staff/types'
import { ROLE_META } from '@/shared/lib/permissions'
import type { MemberWithRelations } from '@/features/administration/types'
import type { MatterRow } from '@/features/matters/types'
import type { StaffProfile } from '@/shared/types/database.types'
import { useAuth } from '@/features/auth/context/auth-provider'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Separator } from '@/shared/components/ui/separator'
import { Badge } from '@/shared/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

function toDefaults(profile?: StaffProfile | null): StaffProfileFormValues {
  return {
    barNumber: profile?.bar_number ?? '',
    yearAdmitted: profile?.year_admitted != null ? String(profile.year_admitted) : '',
    qualifications: (profile?.qualifications ?? []).join(', '),
    specializations: (profile?.specializations ?? []).join(', '),
    hourlyRate: profile?.hourly_rate != null ? String(profile.hourly_rate) : '',
    bio: profile?.bio ?? '',
    availability: (profile?.availability as StaffProfileFormValues['availability']) ?? 'available',
    phone: profile?.phone ?? '',
  }
}

export function StaffProfileDialog({
  member,
  profile,
  assignedMatters,
  canManage,
  open,
  onOpenChange,
}: {
  member: MemberWithRelations
  profile: StaffProfile | null
  assignedMatters: MatterRow[]
  canManage: boolean
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile: me } = useAuth()
  const upsert = useUpsertStaffProfile(activeOrgId)
  const uploadAvatar = useUploadAvatar(activeOrgId)
  const removeMember = useRemoveMember(activeOrgId)
  const isSelf = member.user_id === me?.id
  const canEdit = canManage || isSelf
  const canRemove = canManage && !isSelf && !member.is_owner
  // Bar number/year admitted only mean something for people who can
  // actually be admitted to the bar — Leadership and Fee Earners.
  // Paralegal/Litigation Clerk aren't bar-admitted, and it's meaningless
  // noise on a Finance/HR/Secretary/Receptionist profile.
  const roleGroup = member.role?.key ? ROLE_META[member.role.key]?.group : undefined
  const isLawyer = roleGroup === 'Leadership' || roleGroup === 'Fee Earners'

  const fileRef = React.useRef<HTMLInputElement>(null)
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(member.profile?.avatar_url ?? null)
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const name = member.profile?.full_name ?? member.profile?.email ?? 'this member'

  const form = useForm<StaffProfileFormValues>({ resolver: zodResolver(staffProfileSchema), defaultValues: toDefaults(profile) })
  React.useEffect(() => {
    if (open) {
      form.reset(toDefaults(profile))
      setAvatarUrl(member.profile?.avatar_url ?? null)
    }
  }, [open, profile, member, form])

  const onPickAvatar = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file')
      return
    }
    try {
      const url = await uploadAvatar.mutateAsync({ userId: member.user_id, file })
      setAvatarUrl(url)
      toast.success('Photo updated')
    } catch (err) {
      toast.error('Could not upload photo', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const onSubmit = async (values: StaffProfileFormValues) => {
    try {
      await upsert.mutateAsync({ userId: member.user_id, values })
      toast.success('Profile saved')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-14 w-14">
                {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
                <AvatarFallback>{initialsOf(member.profile?.full_name, 'U')}</AvatarFallback>
              </Avatar>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow hover:opacity-90"
                    aria-label="Change photo"
                  >
                    {uploadAvatar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      onPickAvatar(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </>
              )}
            </div>
            <div>
              <p>{member.profile?.full_name ?? member.profile?.email}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {member.role?.name}
                {member.profile?.title ? ` · ${member.profile.title}` : ''}
              </p>
            </div>
          </DialogTitle>
          <DialogDescription>{member.profile?.email}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <fieldset disabled={!canEdit} className="space-y-4">
              <div className={cn('grid gap-4', isLawyer ? 'sm:grid-cols-3' : 'sm:grid-cols-1')}>
                {isLawyer && (
                  <>
                    <FormField control={form.control} name="barNumber" render={({ field }) => (
                      <FormItem><FormLabel>Bar number</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                    )} />
                    <FormField control={form.control} name="yearAdmitted" render={({ field }) => (
                      <FormItem><FormLabel>Year admitted</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                    )} />
                  </>
                )}
                <FormField control={form.control} name="availability" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Availability</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {AVAILABILITY_OPTIONS.map((a) => <SelectItem key={a} value={a}>{AVAILABILITY_META[a].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="hourlyRate" render={({ field }) => (
                  <FormItem><FormLabel>Hourly rate (₦)</FormLabel><FormControl><Input type="number" {...field} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="specializations" render={({ field }) => (
                <FormItem><FormLabel>Specializations (comma-separated)</FormLabel><FormControl><Input placeholder="Litigation, Corporate" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="qualifications" render={({ field }) => (
                <FormItem><FormLabel>Qualifications (comma-separated)</FormLabel><FormControl><Input placeholder="LL.B, BL, LL.M" {...field} /></FormControl></FormItem>
              )} />
              <FormField control={form.control} name="bio" render={({ field }) => (
                <FormItem><FormLabel>Bio</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl></FormItem>
              )} />
            </fieldset>

            <Separator />
            <div>
              <p className="mb-2 text-sm font-semibold">Assigned matters ({assignedMatters.length})</p>
              {assignedMatters.length > 0 ? (
                <ul className="space-y-1.5">
                  {assignedMatters.map((m) => (
                    <li key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                      <Link to={`/matters/${m.id}`} className="truncate hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">{m.matter_number}</span> {m.title}
                      </Link>
                      <Badge variant="outline" className="capitalize">{m.status.replace('_', ' ')}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No matters currently assigned.</p>
              )}
            </div>

            {(canEdit || canRemove) && (
              <DialogFooter className="sm:justify-between">
                {canRemove ? (
                  <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                    <UserMinus className="h-4 w-4" /> Remove from firm
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
                  {canEdit && <Button type="submit" loading={upsert.isPending}>Save profile</Button>}
                </div>
              </DialogFooter>
            )}
          </form>
        </Form>

        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Remove from firm"
          destructive
          confirmLabel="Remove"
          loading={removeMember.isPending}
          description={<>This revokes <strong>{name}</strong>'s access to {member.profile ? 'the firm' : 'this workspace'}. Their matters and history stay intact.</>}
          onConfirm={async () => {
            try {
              await removeMember.mutateAsync({ membershipId: member.id, name })
              toast.success(`${name} removed from the firm`)
              setConfirmRemove(false)
              onOpenChange(false)
            } catch (err) {
              toast.error('Could not remove member', { description: err instanceof Error ? err.message : undefined })
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
