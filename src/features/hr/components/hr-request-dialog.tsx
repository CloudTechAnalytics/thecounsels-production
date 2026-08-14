import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSubmitHrRequest } from '@/features/hr/hooks/use-hr'
import { HR_REQUEST_TYPES } from '@/features/hr/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function HrRequestDialog() {
  const { activeOrgId, userId } = useAuth()
  const submit = useSubmitHrRequest(activeOrgId, userId)
  const [open, setOpen] = React.useState(false)
  const [requestType, setRequestType] = React.useState(HR_REQUEST_TYPES[0].value)
  const [subject, setSubject] = React.useState('')
  const [details, setDetails] = React.useState('')

  const submitRequest = async () => {
    if (!subject.trim()) {
      toast.error('Give your request a short subject')
      return
    }
    try {
      await submit.mutateAsync({ requestType, subject: subject.trim(), details: details.trim() || undefined })
      toast.success('Request submitted')
      setOpen(false)
      setSubject(''); setDetails('')
    } catch (err) {
      toast.error('Could not submit request', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New request</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New HR request</DialogTitle>
          <DialogDescription>Employment letters, certificates, equipment, or anything else HR handles.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {HR_REQUEST_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Salary certificate for visa application" />
          </div>
          <div className="space-y-1.5">
            <Label>Details (optional)</Label>
            <Textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submitRequest} loading={submit.isPending}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
