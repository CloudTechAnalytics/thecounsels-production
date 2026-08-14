import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useLeaveTypes, useRequestLeave } from '@/features/hr/hooks/use-hr'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function LeaveRequestDialog() {
  const { activeOrgId } = useAuth()
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const request = useRequestLeave(activeOrgId)
  const [open, setOpen] = React.useState(false)
  const [leaveTypeId, setLeaveTypeId] = React.useState('')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (open && leaveTypes && leaveTypes.length > 0 && !leaveTypeId) setLeaveTypeId(leaveTypes[0].id)
  }, [open, leaveTypes, leaveTypeId])

  const submit = async () => {
    if (!leaveTypeId || !start || !end) {
      toast.error('Fill in leave type, start and end date')
      return
    }
    try {
      await request.mutateAsync({ leaveTypeId, start, end, reason: reason.trim() || undefined })
      toast.success('Leave requested', { description: 'Your manager/HR will review it.' })
      setOpen(false)
      setStart(''); setEnd(''); setReason('')
    } catch (err) {
      toast.error('Could not submit request', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Request leave</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>Submitted requests go to whoever can approve leave at your firm.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Leave type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger><SelectValue placeholder="Choose a leave type" /></SelectTrigger>
              <SelectContent>
                {leaveTypes?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {leaveTypes?.length === 0 && (
              <p className="text-xs text-muted-foreground">No leave types configured yet — ask HR to set one up.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={request.isPending}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
