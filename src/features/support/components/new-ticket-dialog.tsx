import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useCreateTicket } from '@/features/support/hooks/use-support'
import { TICKET_PRIORITIES, TICKET_PRIORITY_META } from '@/features/support/types'
import type { TicketPriority } from '@/shared/types/database.types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'

export function NewTicketDialog({
  open,
  onOpenChange,
  organizationId,
  organizations,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Firm side: the active org. Omit on the platform side and pass `organizations`. */
  organizationId?: string
  /** Platform side: pick which firm the ticket is for (e.g. phoned-in issues). */
  organizations?: { id: string; name: string }[]
}) {
  const { userId } = useAuth()
  const create = useCreateTicket()
  const [form, setForm] = React.useState({ orgId: '', subject: '', body: '', priority: 'medium' as TicketPriority })

  React.useEffect(() => {
    if (open) setForm({ orgId: organizationId ?? '', subject: '', body: '', priority: 'medium' })
  }, [open, organizationId])

  const submit = async () => {
    if (!form.orgId || !form.subject.trim() || !form.body.trim()) {
      toast.error('Fill in the subject and description')
      return
    }
    try {
      await create.mutateAsync({
        organizationId: form.orgId,
        subject: form.subject,
        body: form.body,
        priority: form.priority,
        createdBy: userId,
      })
      toast.success('Ticket created')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not create ticket', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New support ticket</DialogTitle>
          <DialogDescription>
            {organizations ? 'Log an issue on behalf of a firm.' : 'Describe the issue and our team will get back to you.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {organizations && (
            <div className="space-y-1.5">
              <Label>Organization</Label>
              <Select value={form.orgId} onValueChange={(v) => setForm((f) => ({ ...f, orgId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a firm…" /></SelectTrigger>
                <SelectContent>
                  {organizations.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Short summary of the issue"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="What happened? What did you expect?"
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TicketPriority }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>{TICKET_PRIORITY_META[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create ticket</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
