import * as React from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Printer, FileDown, FolderUp, PenLine } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useDocumentTemplate } from '@/features/documents/hooks/use-templates'
import { useUploadDocuments } from '@/features/documents/hooks/use-documents'
import { LETTER_CSS, contextValues, placeholderKeys, prettyField, renderTemplate, wordDocument } from '@/features/documents/lib/templates'
import { letterhead, openPrintDocument } from '@/shared/lib/print-document'
import { printDocumentToPdf } from '@/shared/lib/html-to-pdf'
import { openBlankPrintWindow } from '@/shared/lib/signatures'
import { supabase } from '@/shared/lib/supabase'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const NONE = '__none__'
const LONG_FIELD = /(facts|scope|what_happened|description|details|terms|reason|action)/

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function UseTemplatePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { activeOrgId, activeMembership, profile, userId } = useAuth()
  const { has } = usePermissions()
  const { data: template, isLoading } = useDocumentTemplate(id)
  const { data: clients = [] } = useClients(activeOrgId, {})
  const { data: matters = [] } = useMatters(activeOrgId, {})
  const upload = useUploadDocuments(activeOrgId, userId ?? null)
  const { data: mySignature } = useQuery({
    queryKey: ['my-signature', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data } = await supabase.from('user_signatures').select('image, updated_at').eq('user_id', userId!).maybeSingle()
      return data
    },
  })

  const [matterId, setMatterId] = React.useState<string>(params.get('matter') ?? NONE)
  const [clientId, setClientId] = React.useState<string>(NONE)
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [sign, setSign] = React.useState(true)

  const matter = matters.find((m) => m.id === matterId) ?? null
  React.useEffect(() => { if (matter?.client_id) setClientId(matter.client_id) }, [matter?.client_id])
  const client = clients.find((c) => c.id === clientId) ?? null
  const firm: { name: string; legal_name?: string | null; logo_url?: string | null; phone?: string | null; billing_email?: string | null; website?: string | null } =
    activeMembership?.organization ?? { name: 'Your firm' }

  const auto = React.useMemo(() => contextValues({
    firm,
    client,
    matter,
    me: { name: profile?.full_name ?? null, title: profile?.title ?? activeMembership?.title ?? activeMembership?.role.name ?? null, email: profile?.email ?? null },
  }), [firm, client, matter, profile, activeMembership])

  const keys = template ? placeholderKeys(template.body).filter((k) => k !== 'signature') : []
  const toAsk = keys.filter((k) => !auto[k])
  const values = { ...auto, ...Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim())) }
  const missing = toAsk.filter((k) => !answers[k]?.trim())
  const signature = sign ? mySignature?.image ?? null : null
  const finalHtml = template ? renderTemplate(template.body, values, { signature }) : ''
  const title = template ? `${template.name}${client ? ` — ${client.display_name}` : ''}` : 'Document'

  // One definition of the finished letter, shared by print, PDF and save.
  const page = {
    title,
    firm,
    head: letterhead(firm, { title: '' }),
    body: `<div class="letter" style="margin-top:7mm">${finalHtml}</div>`,
    css: LETTER_CSS,
    footNote: matter?.matter_number ? `Ref: ${matter.matter_number}` : template?.name,
  }
  const print = () => {
    if (!template) return
    openPrintDocument({ ...page, win: openBlankPrintWindow() })
  }
  const fileName = `${title.replace(/[\\/:*?"<>|]+/g, '-')} ${format(new Date(), 'yyyy-MM-dd')}.doc`
  const pdfName = fileName.replace(/\.doc$/, '.pdf')
  const downloadWord = () => downloadBlob(wordDocument(title, firm, finalHtml), fileName)
  const [pdfBusy, setPdfBusy] = React.useState(false)
  const downloadPdf = async () => {
    setPdfBusy(true)
    try { downloadBlob(await printDocumentToPdf(page), pdfName) }
    catch (err) { toast.error('Could not create the PDF', { description: errorMessage(err) }) }
    finally { setPdfBusy(false) }
  }
  // Saved as the same designed, signed PDF the print shows — what you see in the matter is what was sent.
  const saveToMatter = async () => {
    if (!matter) return
    setPdfBusy(true)
    try {
      const file = new File([await printDocumentToPdf(page)], pdfName, { type: 'application/pdf' })
      await upload.mutateAsync({ file, matterId: matter.id, category: template?.category ?? 'Correspondence', displayName: pdfName })
      toast.success('Saved to the matter’s documents', { description: `${pdfName} — with letterhead and signature` })
    } catch (err) { toast.error('Could not save to the matter', { description: errorMessage(err) }) }
    finally { setPdfBusy(false) }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!template) {
    return (
      <Card className="p-10 text-center">
        <p className="font-medium">Template not found</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/documents/templates">Back to templates</Link></Button>
      </Card>
    )
  }

  return (
    <div className="w-full">
      <Link to={params.get('matter') ? `/matters/${params.get('matter')}` : '/documents/templates'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {params.get('matter') ? 'Back to matter' : 'Templates'}
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{template.name}</h1>
          {template.description && <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {has('documents.upload') && (
            <Button variant="outline" onClick={saveToMatter} disabled={!matter || pdfBusy} loading={upload.isPending} title={matter ? undefined : 'Choose a matter first'}>
              <FolderUp className="h-4 w-4" /> Save to matter
            </Button>
          )}
          <Button variant="outline" onClick={downloadWord}><FileDown className="h-4 w-4" /> Word</Button>
          <Button variant="outline" onClick={downloadPdf} loading={pdfBusy && !upload.isPending}><FileDown className="h-4 w-4" /> Download PDF</Button>
          <Button onClick={print}><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <p className="text-sm font-semibold">Who is it for?</p>
            <div className="space-y-1.5">
              <Label>Matter</Label>
              <Select value={matterId} onValueChange={setMatterId}>
                <SelectTrigger><SelectValue placeholder="No matter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No matter</SelectItem>
                  {matters.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number ? `${m.matter_number} · ` : ''}{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="No client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No client</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <p className="text-sm font-semibold">Details to fill in</p>
              <p className="text-xs text-muted-foreground">{toAsk.length === 0 ? 'Everything is filled in from the matter, client and your profile.' : `${missing.length} of ${toAsk.length} still empty — highlighted in the preview.`}</p>
            </div>
            {toAsk.map((k) => (
              <div key={k} className="space-y-1.5">
                <Label>{prettyField(k)}</Label>
                {LONG_FIELD.test(k)
                  ? <Textarea rows={3} value={answers[k] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />
                  : <Input value={answers[k] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [k]: e.target.value }))} />}
              </div>
            ))}
          </Card>

          {template.body.includes('{{signature}}') && (
            <Card className="space-y-2 p-5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={sign} onChange={(e) => setSign(e.target.checked)} />
                Sign with my e-signature
              </label>
              {mySignature ? (
                <img src={mySignature.image} alt="Your signature" className="max-h-12 rounded border border-dashed border-border bg-white px-2" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  You haven’t added a signature yet. <button className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => navigate('/settings')}><PenLine className="h-3 w-3" /> Add it in Settings</button>
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-primary" />
            <div className="border-b border-border bg-white px-8 py-5">
              <p className="font-display text-lg font-semibold text-stone-900">{firm.legal_name || firm.name}</p>
              <p className="text-xs text-stone-500">{[firm.phone, firm.billing_email, firm.website].filter(Boolean).join(' · ')}</p>
            </div>
            <style>{LETTER_CSS}</style>
            <div className="letter max-h-[75vh] overflow-y-auto bg-white p-8 text-stone-900" dangerouslySetInnerHTML={{ __html: renderTemplate(template.body, values, { signature, preview: true }) }} />
          </Card>
        </div>
      </div>
    </div>
  )
}
