import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Laptop, LogOut, ShieldX } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { supabase } from '@/shared/lib/supabase'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { toast } from '@/shared/components/ui/sonner'

/** Rough, dependency-free device label from the UA string — good enough to tell devices apart. */
function describeDevice(ua: string): string {
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'a browser'
  return `${browser} on ${os}`
}

export function SessionsCard() {
  const { signOutOtherSessions, signOutEverywhere } = useAuth()
  const [signedInAt, setSignedInAt] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<'others' | 'all' | null>(null)

  React.useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedInAt(data.session?.user.last_sign_in_at ?? null))
  }, [])

  const endOthers = async () => {
    setBusy('others')
    try {
      await signOutOtherSessions()
      toast.success('Signed out of all other devices')
    } catch (err) {
      toast.error('Could not end other sessions', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(null)
    }
  }

  const endAll = async () => {
    setBusy('all')
    try {
      await signOutEverywhere()
      // The auth listener flips status to unauthenticated and the router sends us to /auth/login.
    } catch (err) {
      toast.error('Could not sign out everywhere', { description: err instanceof Error ? err.message : undefined })
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Active sessions</CardTitle>
        <p className="text-sm text-muted-foreground">Where you're currently signed in.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
          <span className="flex items-start gap-3">
            <Laptop className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>
              <span className="text-sm font-medium">{describeDevice(navigator.userAgent)}</span>
              <span className="block text-xs text-muted-foreground">
                {signedInAt
                  ? `Signed in ${formatDistanceToNow(new Date(signedInAt), { addSuffix: true })}`
                  : 'This device'}
              </span>
            </span>
          </span>
          <Badge variant="success">This device</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Individual devices aren't listed by name — but you can end every other session at once if you've
          signed in somewhere you don't recognize.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={endOthers} loading={busy === 'others'} disabled={busy !== null}>
            <ShieldX /> Sign out other devices
          </Button>
          <Button variant="outline" onClick={endAll} loading={busy === 'all'} disabled={busy !== null}>
            <LogOut /> Sign out everywhere
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
