import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, MailWarning } from 'lucide-react'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { useAuth } from '@/features/auth/context/auth-provider'
import { authService } from '@/features/auth/services/auth.service'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { status, refresh } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState(false)

  const accept = async () => {
    if (!token) return
    setBusy(true)
    try {
      await authService.acceptInvitation(token)
      await refresh()
      toast.success('Invitation accepted', { description: 'Welcome to the firm workspace.' })
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Could not accept invitation', {
        description: errorMessage(err, 'The invitation may be invalid or expired.'),
      })
    } finally {
      setBusy(false)
    }
  }

  if (!token) {
    return (
      <AuthShell title="Invalid invitation" subtitle="This invitation link is missing its token.">
        <div className="rounded-lg border border-border/70 bg-card p-6 text-center shadow-card">
          <MailWarning className="mx-auto h-8 w-8 text-warning" />
          <p className="mt-3 text-sm text-muted-foreground">
            Please use the exact link from your invitation email.
          </p>
        </div>
      </AuthShell>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <AuthShell
        title="Sign in to accept"
        subtitle="Sign in with the email your invitation was sent to, then return to this link."
      >
        <Button asChild size="lg" className="w-full">
          <Link to="/auth/login" state={{ from: `/auth/accept-invite?token=${token}` }}>
            Continue to sign in
          </Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Join your firm" subtitle="You've been invited to a workspace on The Counsel.">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-border/70 bg-card p-6 text-center shadow-card"
      >
        <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">
          Accept this invitation to activate your membership and access the workspace.
        </p>
      </motion.div>
      <Button onClick={accept} size="lg" className="mt-6 w-full" loading={busy}>
        Accept invitation
      </Button>
    </AuthShell>
  )
}
