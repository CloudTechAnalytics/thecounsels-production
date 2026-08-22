import * as React from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useUpdateProfile, useUploadAvatar } from '@/features/settings/hooks/use-settings'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

export function ProfileCard() {
  const { profile, activeMembership, refresh } = useAuth()
  const update = useUpdateProfile(profile?.id ?? null)
  const uploadAvatar = useUploadAvatar(profile?.id ?? null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [form, setForm] = React.useState({ fullName: '', phone: '', title: '' })

  React.useEffect(() => {
    if (profile) {
      setForm({ fullName: profile.full_name ?? '', phone: profile.phone ?? '', title: profile.title ?? '' })
    }
  }, [profile])

  const dirty =
    profile != null &&
    (form.fullName !== (profile.full_name ?? '') || form.phone !== (profile.phone ?? '') || form.title !== (profile.title ?? ''))

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.fullName.trim()) {
      toast.error('Full name is required')
      return
    }
    try {
      await update.mutateAsync({ full_name: form.fullName.trim(), phone: form.phone || null, title: form.title || null })
      await refresh()
      toast.success('Profile saved')
    } catch (err) {
      toast.error('Could not save profile', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const onAvatar = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image')
      return
    }
    try {
      await uploadAvatar.mutateAsync(file)
      await refresh()
      toast.success('Photo updated')
    } catch (err) {
      toast.error('Could not upload photo', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Profile</CardTitle>
        <p className="text-sm text-muted-foreground">Your name, photo and contact details.</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 border-b border-border pb-6">
          <div className="relative">
            <Avatar className="h-16 w-16">
              {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
              <AvatarFallback>{initialsOf(profile?.full_name ?? profile?.email)}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground hover:opacity-90"
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
                void onAvatar(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          <div>
            <p className="font-display text-lg font-semibold">{profile?.full_name || 'Your name'}</p>
            <p className="text-sm text-muted-foreground">
              {activeMembership?.role.name ?? 'Team member'} · {profile?.email}
            </p>
            {activeMembership && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {activeMembership.access_scope === 'organization'
                  ? 'Access: all branches'
                  : activeMembership.member_branches.length > 0
                    ? `Branch${activeMembership.member_branches.length > 1 ? 'es' : ''}: ${activeMembership.member_branches.map((mb) => mb.branch.name).join(', ')}`
                    : 'No branch assigned yet — contact your firm admin'}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Senior Associate" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+234 800 000 0000" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={profile?.email ?? ''} disabled />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={save} loading={update.isPending} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
