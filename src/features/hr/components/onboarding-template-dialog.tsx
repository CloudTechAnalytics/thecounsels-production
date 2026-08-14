import * as React from 'react'
import { useCreateOnboardingTemplate } from '@/features/hr/hooks/use-hr'
import { useAuth } from '@/features/auth/context/auth-provider'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

/** Quick template creation — one checklist item per line, all assigned to
 * the new employee themselves. A per-item assignee picker (employee vs.
 * manager vs. HR, which the schema already supports) is a reasonable
 * follow-up if a firm actually needs it; most onboarding items (sign
 * contract, submit ID, complete orientation) are naturally the new
 * hire's own tasks anyway. */
export function OnboardingTemplateDialog() {
  const { activeOrgId } = useAuth()
  const create = useCreateOnboardingTemplate(activeOrgId)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [items, setItems] = React.useState('')

  const submit = async () => {
    const lines = items.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!name.trim() || lines.length === 0) {
      toast.error('Give the checklist a name and at least one item')
      return
    }
    try {
      await create.mutateAsync({ name: name.trim(), items: lines.map((label) => ({ label, assignee: 'employee' as const })) })
      toast.success('Onboarding checklist created')
      setOpen(false)
      setName(''); setItems('')
    } catch (err) {
      toast.error('Could not create checklist', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">New onboarding checklist</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New onboarding checklist</DialogTitle>
          <DialogDescription>One item per line — each becomes a real task assigned to the new employee once you assign this checklist to them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Checklist name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Associate Onboarding" />
          </div>
          <div className="space-y-1.5">
            <Label>Items</Label>
            <Textarea
              rows={6}
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder={'Employment contract signed\nID submitted\nFirm email created\nOrientation completed'}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
