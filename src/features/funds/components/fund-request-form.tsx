import * as React from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useClients } from '@/features/clients/hooks/use-clients'
import { isMatterClosed } from '@/features/matters/types'
import { useFundSettings, useSaveFundRequest } from '@/features/funds/hooks/use-funds'
import { FUND_CATEGORIES, fundCategoryLabel, type FundRequest, type FundRequestRow } from '@/features/funds/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const NONE = '__none__'
export const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Matters to pick from — only the chosen client's, when a client is chosen. */
function MatterSelect({ value, onChange, matters }: { value: string; onChange: (v: string) => void; matters: { id: string; matter_number: string | null; title: string }[] }) {
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

function ClientSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { activeOrgId } = useAuth()
  const { data: clients } = useClients(activeOrgId, {})
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No client</SelectItem>
        {(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

/** New request, or editing a draft / a returned or recalled request — laid out on a page. */
export function FundRequestForm({ request, onDone, onCancel }: { request?: FundRequest | null; onDone: (rec: FundRequestRow) => void; onCancel: () => void }) {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data: settings } = useFundSettings(activeOrgId)
  const save = useSaveFundRequest(activeOrgId)
  const [title, setTitle] = React.useState('')
  const [category, setCategory] = React.useState(FUND_CATEGORIES[0].value)
  const [amount, setAmount] = React.useState('')
  const [neededBy, setNeededBy] = React.useState('')
  const [matterId, setMatterId] = React.useState('')
  const [clientId, setClientId] = React.useState('')
  const { data: allMatters } = useMatters(activeOrgId, {})
  const openMatters = React.useMemo(() => (allMatters ?? []).filter((m) => !isMatterClosed(m.status) || m.id === matterId), [allMatters, matterId])
  // Picking a client narrows the matters to theirs (and picks it when there's only one);
  // picking a matter fills in its client.
  const matterOptions = React.useMemo(() => (clientId ? openMatters.filter((m) => m.client_id === clientId) : openMatters), [openMatters, clientId])
  const chooseClient = (c: string) => {
    setClientId(c)
    if (!c) return
    const theirs = openMatters.filter((m) => m.client_id === c)
    if (theirs.length === 1) setMatterId(theirs[0].id)
    else if (!theirs.some((m) => m.id === matterId)) setMatterId('')
  }
  const chooseMatter = (m: string) => {
    setMatterId(m)
    const client = openMatters.find((x) => x.id === m)?.client_id
    if (client) setClientId(client)
  }
  const [purpose, setPurpose] = React.useState('')
  const [files, setFiles] = React.useState<File[]>([])
  const [submitting, setSubmitting] = React.useState<'draft' | 'submit' | null>(null)

  React.useEffect(() => {
    setTitle(request?.title ?? '')
    setCategory(request?.category ?? FUND_CATEGORIES[0].value)
    setAmount(request ? String(request.amount) : '')
    setNeededBy(request?.needed_by ?? '')
    setMatterId(request?.matter_id ?? '')
    setClientId(request?.client_id ?? '')
    setPurpose(request?.purpose ?? '')
    setFiles([])
  }, [request?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = Number(amount)
  const needsPartner = settings?.leadership_threshold != null && value >= settings.leadership_threshold
  const categories = FUND_CATEGORIES.some((c) => c.value === category) ? FUND_CATEGORIES : [...FUND_CATEGORIES, { value: category, label: fundCategoryLabel(category) }]

  const addFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    const bad = picked.find((f) => !ATTACHMENT_MIME_TYPES.includes(f.type) || f.size > MAX_ATTACHMENT_BYTES)
    if (bad) { toast.error(`${bad.name}: attach PDFs, images, Word or Excel files up to 10 MB`); return }
    setFiles((f) => [...f, ...picked])
  }

  const run = async (submit: boolean) => {
    if (!title.trim() || !(value > 0)) {
      toast.error('Add a title and an amount greater than zero')
      return
    }
    setSubmitting(submit ? 'submit' : 'draft')
    try {
      const rec = await save.mutateAsync({
        input: { title: title.trim(), category, amount: value, neededBy, matterId, clientId, purpose: purpose.trim() },
        requestId: request?.id,
        submit,
        files,
      })
      toast.success(submit ? `Request ${rec.request_number ?? ''} submitted` : 'Draft saved', {
        description: submit ? 'It has gone to the first approver.' : 'Submit it whenever you’re ready.',
      })
      onDone(rec)
    } catch (err) {
      toast.error(submit ? 'Could not submit request' : 'Could not save draft', { description: errorMessage(err) })
    } finally {
      setSubmitting(null)
    }
  }

  const returned = request?.status === 'returned'
  const returnNote = returned ? request.chain.find((a) => a.status === 'returned')?.comment ?? request.approvals.filter((a) => a.status === 'returned').at(-1)?.comment : null

  return (
    <div className="space-y-5">
        {returnNote && (
          <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"><span className="font-medium">Clarification requested:</span> {returnNote}</p>
        )}
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
                  {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₦)</Label>
              <Input type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Needed by</Label>
              <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            {has('clients.view') && (
              <div className="space-y-1.5">
                <Label>Client (optional)</Label>
                <ClientSelect value={clientId} onChange={chooseClient} />
              </div>
            )}
            {has('matters.view') && (
              <div className="space-y-1.5">
                <Label>Matter (optional)</Label>
                <MatterSelect value={matterId} onChange={chooseMatter} matters={matterOptions} />
                {clientId && matterOptions.length === 0 && <p className="text-xs text-muted-foreground">This client has no open matters.</p>}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Purpose and description</Label>
            <Textarea rows={3} placeholder="Breakdown, who it's paid to, anything the approver should know" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Supporting documents (optional)</Label>
            <input type="file" multiple accept={ATTACHMENT_MIME_TYPES.join(',')} className="block max-w-full text-xs" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            {files.length > 0 && (
              <ul className="space-y-1 text-xs">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
                    <span className="truncate">{f.name}</span>
                    <button aria-label={`Remove ${f.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
            {request && request.attachments.filter((a) => a.kind === 'supporting').length > 0 && (
              <p className="text-xs text-muted-foreground">{request.attachments.filter((a) => a.kind === 'supporting').length} file(s) already attached.</p>
            )}
          </div>
          {needsPartner && !request?.workflow_id && (
            <p className="text-xs text-muted-foreground">This amount also needs a partner's approval.</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          {!returned && <Button variant="outline" onClick={() => run(false)} loading={submitting === 'draft'} disabled={submitting !== null}>Save draft</Button>}
          <Button onClick={() => run(true)} loading={submitting === 'submit'} disabled={submitting !== null}>{returned ? 'Resubmit' : 'Submit request'}</Button>
        </div>
    </div>
  )
}
