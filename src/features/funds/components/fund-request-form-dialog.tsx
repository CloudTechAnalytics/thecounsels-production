import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { isMatterClosed } from '@/features/matters/types'
import { useFundSettings, useSubmitFundRequest } from '@/features/funds/hooks/use-funds'
import { FUND_CATEGORIES } from '@/features/funds/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira } from '@/shared/lib/format'

const NONE = '__none__'

function MatterSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { activeOrgId } = useAuth()
  const { data: allMatters } = useMatters(activeOrgId, {})
  const matters = React.useMemo(() => (allMatters ?? []).filter((m) => !isMatterClosed(m.status)), [allMatters])
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger><SelectValue placeholder="No matter" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No matter</SelectItem>
        {matters.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function FundRequestFormDialog() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: settings } = useFundSettings(activeOrgId)
  const submit = useSubmitFundRequest(activeOrgId)
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState(FUND_CATEGORIES[0].value)
  const [amount, setAmount] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [matterId, setMatterId] = React.useState('')
  const [purpose, setPurpose] = React.useState('')

  const value = Number(amount)
  const needsPartner = settings?.leadership_threshold != null && value >= settings.leadership_threshold

  const reset = () => { setTitle(''); setAmount(''); setNeededBy(''); setMatterId(''); setPurpose(''); setCategory(FUND_CATEGORIES[0].value) }

  const onSubmit = async () => {
    if (!title.trim() || !(value > 0)) {
      toast.error('Add a title and an amount greater than zero')
      return
    }
    try {
      const rec = await submit.mutateAsync({ title: title.trim(), category, amount: value, neededBy, matterId, purpose: purpose.trim() })
      toast.success(`Request ${rec.request_number} submitted`, { description: 'It has gone to the first approver.' })
      setOpen(false)
      reset()
    } catch (err) {
      toast.error('Could not submit request', { description: errorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Request funds</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request funds</DialogTitle>
          <DialogDescription>
            Goes to your line manager first (if you have one), then to finance
            {settings?.leadership_threshold != null ? `, and to a partner for ${formatNaira(settings.leadership_threshold)} or more` : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What is it for?</Label>
            <Input placeholder="e.g. Filing fees — Federal High Court, Lagos" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FUND_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₦)</Label>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Needed by (optional)</Label>
              <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            {has('matters.view') && (
              <div className="space-y-1.5">
                <Label>Matter (optional)</Label>
                <MatterSelect value={matterId} onChange={setMatterId} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Details (optional)</Label>
            <Textarea rows={3} placeholder="Breakdown, who it's paid to, anything the approver should know" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          {needsPartner && (
            <p className="text-xs text-muted-foreground">This amount also needs a partner's approval.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onSubmit} loading={submit.isPending}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
