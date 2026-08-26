import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useAdjournHearing } from '@/features/hearings/hooks/use-hearings'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
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
import { friendlyErrorMessage } from '@/shared/lib/errors'

/** yyyy-MM-ddThh:mm in local time for <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

/** The dedicated "adjourned" flow — reschedules to a new date and marks the
 * status in one action, instead of the old two-step "change status, then
 * separately remember to go edit the date" (which "Edit" never made
 * obviously the place to do). See hearings.service.ts's adjourn() for why
 * this also resets the reminder engine correctly. */
export function AdjournHearingDialog({
  hearing,
  open,
  onOpenChange,
}: {
  hearing: { id: string; title: string; hearing_at: string }
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId } = useAuth()
  const [newDate, setNewDate] = React.useState(() => toLocalInput(hearing.hearing_at))
  const [reason, setReason] = React.useState('')
  const adjourn = useAdjournHearing(activeOrgId)

  React.useEffect(() => {
    if (open) {
      setNewDate(toLocalInput(hearing.hearing_at))
      setReason('')
    }
  }, [open, hearing.hearing_at])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDate) return
    try {
      await adjourn.mutateAsync({ id: hearing.id, title: hearing.title, newHearingAt: newDate, reason })
      toast.success('Hearing adjourned')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not adjourn hearing', { description: friendlyErrorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjourn hearing</DialogTitle>
          <DialogDescription>Set the new date — this marks it adjourned and reschedules it in one step.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adjourn-date">New date &amp; time</Label>
            <Input id="adjourn-date" type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjourn-reason">Reason (optional)</Label>
            <Textarea
              id="adjourn-reason"
              rows={2}
              placeholder="e.g. Counsel unavailable, adjourned at defence's request…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjourn.isPending}>
              Adjourn to new date
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
