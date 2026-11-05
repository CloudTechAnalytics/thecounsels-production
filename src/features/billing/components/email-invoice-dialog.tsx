import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail } from 'lucide-react'
import type { InvoiceDetail } from '@/features/billing/types'
import { supabase } from '@/shared/lib/supabase'
import { invokeEdgeFunction } from '@/shared/lib/edge-function'
import { formatNaira } from '@/shared/lib/format'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Sends the invoice to the client by email (send-invoice-email). The
 * client's email on file is filled in; any address can be typed instead. */
export function EmailInvoiceDialog({ inv, firmName, open, onOpenChange }: { inv: InvoiceDetail; firmName: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const { data: clientEmail } = useQuery({
    queryKey: ['client-email', inv.client_id],
    enabled: open && Boolean(inv.client_id),
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('email').eq('id', inv.client_id!).maybeSingle()
      return data?.email ?? ''
    },
  })
  const balance = Number(inv.total) - Number(inv.amount_paid)
  const [to, setTo] = React.useState('')
  const [cc, setCc] = React.useState('')
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setTo(clientEmail ?? '')
    setCc('')
    setSubject(`Invoice ${inv.invoice_number ?? ''} from ${firmName}`)
    setMessage(
      balance > 0
        ? `Please find below invoice ${inv.invoice_number ?? ''} for ${formatNaira(balance)}${inv.due_date ? `, due by ${inv.due_date}` : ''}. Payment details are included at the bottom of this email.\n\nThank you for your instruction.`
        : `Please find below invoice ${inv.invoice_number ?? ''} for your records. It has been paid in full — thank you.`,
    )
  }, [open, clientEmail, inv.invoice_number, inv.due_date, firmName, balance])

  const ccList = cc.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean)
  const valid = EMAIL_RE.test(to.trim()) && ccList.every((e) => EMAIL_RE.test(e))

  const send = async () => {
    setSending(true)
    try {
      const res = await invokeEdgeFunction<{ markedSent?: boolean }>('send-invoice-email', { invoiceId: inv.id, to: to.trim(), cc: ccList, subject, message })
      toast.success(`Invoice emailed to ${to.trim()}`, { description: res?.markedSent ? 'It has also been marked as sent.' : undefined })
      qc.invalidateQueries({ queryKey: ['invoice', inv.id] })
      qc.invalidateQueries({ queryKey: ['billing'] })
      qc.invalidateQueries({ queryKey: ['client', inv.client_id, 'communications'] })
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not email the invoice', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email invoice {inv.invoice_number}</DialogTitle>
          <DialogDescription>The client receives the full invoice in the email, with your firm's name and logo. Replies come back to you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>To<span className="text-destructive"> *</span></Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@gmail.com" />
            {!clientEmail && <p className="text-xs text-muted-foreground">No email saved for {inv.client?.display_name ?? 'this client'} — type one in.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>CC (optional)</Label>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="finance@client.com, partner@yourfirm.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Message</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {inv.status === 'draft' && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">This invoice is a draft — sending it will also mark it as sent.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} loading={sending} disabled={!valid}><Mail className="h-4 w-4" /> Send invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
