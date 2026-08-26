import * as React from 'react'
import { LifeBuoy, Check, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useDenySupportSession, useGrantSupportSession, usePendingSupportSessions } from '@/features/support/hooks/use-support'
import { Button } from '@/shared/components/ui/button'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

/** Firm side of the 0133 grant flow — shown to whoever can act on it (RLS
 * on support_sessions already limits usePendingSupportSessions to
 * is_platform_admin() or is_org_admin(organization_id), and the RPCs
 * underneath re-check the firm-admin condition server-side regardless, so
 * this banner rendering isn't itself the security boundary). Persistent
 * and hard to miss on purpose — CloudTech waiting on a real support issue
 * shouldn't get lost in a notification list. */
export function SupportAccessRequestBanner() {
  const { activeOrgId } = useAuth()
  const { data: pending } = usePendingSupportSessions(activeOrgId)
  const grant = useGrantSupportSession()
  const deny = useDenySupportSession()
  const [toGrant, setToGrant] = React.useState<{ id: string; reason: string | null; adminName: string } | null>(null)

  if (!pending || pending.length === 0) return null
  const current = pending[0]
  const requester = current.admin?.full_name ?? current.admin?.email ?? 'A CloudTech admin'

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 bg-warning px-4 py-2 text-warning-foreground sm:px-6">
        <LifeBuoy className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1 text-sm font-medium">
          {requester} is requesting access to your workspace for support{current.reason ? `: "${current.reason}"` : ''}.
          {pending.length > 1 && <span className="font-normal opacity-90"> (+{pending.length - 1} more waiting)</span>}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={deny.isPending}
            onClick={async () => {
              try {
                await deny.mutateAsync(current.id)
                toast.success('Access denied')
              } catch (err) {
                toast.error('Could not deny access', { description: errorMessage(err) })
              }
            }}
          >
            <X className="h-4 w-4" /> Deny
          </Button>
          <Button
            size="sm"
            onClick={() => setToGrant({ id: current.id, reason: current.reason, adminName: requester })}
          >
            <Check className="h-4 w-4" /> Grant access
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(toGrant)}
        onOpenChange={(o) => !o && setToGrant(null)}
        title="Grant support access"
        confirmLabel="Grant access"
        loading={grant.isPending}
        description={
          <>
            This lets <strong>{toGrant?.adminName}</strong> into your workspace for 30 minutes
            {toGrant?.reason ? <> to: "{toGrant.reason}"</> : null}. Every action they take while inside is audited.
          </>
        }
        onConfirm={async () => {
          if (!toGrant) return
          try {
            await grant.mutateAsync(toGrant.id)
            toast.success('Access granted')
            setToGrant(null)
          } catch (err) {
            toast.error('Could not grant access', { description: errorMessage(err) })
          }
        }}
      />
    </>
  )
}
