import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useLeaveTypes, useRequestLeave, useMyLeaveSummary } from '@/features/hr/hooks/use-hr'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

interface LeavePreview {
  days: number; calendar_days: number; counts_working_days: boolean; accrues: boolean
  holidays: { date: string; name: string }[]
  entitlement: number; accrued: number; used: number; pending: number; available: number
  error?: string
}

/** What a period would cost, worked out by the server exactly as
 * request_leave() will: working days only (unless the type counts calendar
 * days), public holidays skipped, accrual and pending requests counted. */
function useLeavePreview(org: string | null, type: string, start: string, end: string) {
  return useQuery({
    queryKey: ['hr', 'leave-preview', org, type, start, end],
    enabled: Boolean(org && type && start && end && end >= start),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('leave_preview', { p_org: org!, p_type: type, p_start: start, p_end: end })
      if (error) throw error
      return data as unknown as LeavePreview
    },
  })
}

export function LeaveRequestDialog() {
  const { activeOrgId, userId } = useAuth()
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const { data: summary } = useMyLeaveSummary(activeOrgId, userId)
  const request = useRequestLeave(activeOrgId)
  const [open, setOpen] = React.useState(false)
  const [leaveTypeId, setLeaveTypeId] = React.useState('')
  const [start, setStart] = React.useState('')
  const [end, setEnd] = React.useState('')
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (open && leaveTypes && leaveTypes.length > 0 && !leaveTypeId) setLeaveTypeId(leaveTypes[0].id)
  }, [open, leaveTypes, leaveTypeId])

  const { data: preview } = useLeavePreview(activeOrgId, leaveTypeId, start, end)
  const days = preview && !preview.error ? Number(preview.days) : null
  const balance = summary?.find((s) => s.leaveTypeId === leaveTypeId)
  const available = preview && !preview.error ? Number(preview.available) : balance?.balance
  const exceedsBalance = days != null && available != null && days > available
  const nothingToTake = days === 0

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
            {leaveTypes?.length === 0 ? (
              <p className="text-xs text-muted-foreground">No leave types configured yet — ask HR to set one up.</p>
            ) : balance ? (
              <p className="text-xs text-muted-foreground">
                {balance.balance} day{balance.balance === 1 ? '' : 's'} available
                {balance.accrues ? ` · ${balance.accrued} of ${balance.limit} earned so far this year` : ` of ${balance.limit} this year`}
                {balance.pending ? ` · ${balance.pending} pending` : ''}
              </p>
            ) : null}
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
          {preview?.error && <p className="text-sm text-destructive">{preview.error}</p>}
          {days != null && preview && (
            <div className={exceedsBalance || nothingToTake ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
              <p>
                {days} {preview.counts_working_days ? 'working ' : ''}day{days === 1 ? '' : 's'} will be taken
                {preview.counts_working_days && preview.calendar_days > days && (
                  <span className="font-normal"> ({preview.calendar_days - days} weekend{preview.holidays.length ? ' / holiday' : ''} day{preview.calendar_days - days === 1 ? '' : 's'} not counted)</span>
                )}
                {nothingToTake ? ' — those dates are all non-working days or holidays' : exceedsBalance ? ` — only ${available} available` : ` · ${available} available`}
              </p>
              {preview.counts_working_days && preview.holidays.length > 0 && (
                <p className="text-xs font-normal text-muted-foreground">Public holiday{preview.holidays.length === 1 ? '' : 's'}: {preview.holidays.map((h) => h.name).join(', ')}</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Reason (optional)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={request.isPending} disabled={exceedsBalance || nothingToTake}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
