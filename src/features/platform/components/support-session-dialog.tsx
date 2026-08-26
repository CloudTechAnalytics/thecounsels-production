import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { platformService } from '@/features/platform/services/platform.service'
import { trackPendingSupportRequest } from '@/features/platform/components/support-access-waiting-banner'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'

/** Requests support access — no longer enters immediately (0133). The
 * firm's own admin has to grant it; SupportAccessWaitingBanner (mounted in
 * PlatformLayout) picks up the pending request and enters the workspace
 * automatically once granted. */
export function SupportSessionDialog({
  org,
  open,
  onOpenChange,
}: {
  org: { id: string; name: string }
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [reason, setReason] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  const request = async () => {
    if (!reason.trim()) {
      toast.error('Enter a reason for support access')
      return
    }
    setLoading(true)
    try {
      const session = await platformService.requestSupportSession(org.id, reason.trim())
      trackPendingSupportRequest(session.id, org.name)
      toast.success('Access requested', { description: `Waiting for ${org.name} to grant access.` })
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not request support access', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Request support access
          </DialogTitle>
          <DialogDescription>
            This asks <strong>{org.name}</strong> to grant you access to their workspace for support purposes.
            You'll be let in automatically once they approve — a 30-minute, fully audited session from then on.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Reason for access</Label>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Investigating a reported issue with invoice generation (ticket #123)"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" loading={loading} onClick={request}>Request access</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
