import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useDocumentTemplate, useSaveTemplate } from '@/features/documents/hooks/use-templates'
import { LETTER_CSS, PLACEHOLDERS, TEMPLATE_CATEGORIES, renderTemplate } from '@/features/documents/lib/templates'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const GROUPS = ['General', 'Client', 'Matter', 'Firm', 'Signer']

export function TemplateEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: existing, isLoading } = useDocumentTemplate(id)
  const save = useSaveTemplate(activeOrgId)
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)
  const [name, setName] = React.useState('')
  const [category, setCategory] = React.useState<string>('Correspondence')
  const [description, setDescription] = React.useState('')
  const [body, setBody] = React.useState('{{today}}\n\n**{{client.name}}**\n{{client.address}}\n\nDear Sir/Madam,\n\n# Re: {{matter.title}}\n\n\n\nYours faithfully,\n\n{{signature}}\n**{{me.name}}**\nFor: {{firm.name}}')

  React.useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setCategory(existing.category ?? 'Other')
    setDescription(existing.description ?? '')
    setBody(existing.body)
  }, [existing])

  const insert = (text: string) => {
    const el = bodyRef.current
    if (!el) { setBody((b) => b + text); return }
    const start = el.selectionStart
    const next = body.slice(0, start) + text + body.slice(el.selectionEnd)
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length) })
  }

  const run = async () => {
    if (!name.trim()) { toast.error('Give the template a name'); return }
    if (!body.trim()) { toast.error('The template is empty'); return }
    try {
      const savedId = await save.mutateAsync({ id, name: name.trim(), category, description: description.trim() || null, body })
      toast.success(id ? 'Template saved' : 'Template created')
      navigate(id ? '/documents/templates' : `/documents/templates/${savedId}/use`)
    } catch (err) { toast.error('Could not save template', { description: errorMessage(err) }) }
  }

  if (id && isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="w-full">
      <Link to="/documents/templates" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Templates
      </Link>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{id ? 'Edit template' : 'New template'}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/documents/templates')}>Cancel</Button>
          <Button onClick={run} loading={save.isPending}>{id ? 'Save template' : 'Create template'}</Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Letter of Demand" /></div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TEMPLATE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Short description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="When to use it" /></div>
          </Card>

          <Card className="space-y-3 p-5">
            <div>
              <Label>Wording</Label>
              <p className="text-xs text-muted-foreground">
                Click a field to insert it. Make up your own with double braces — e.g. <code className="rounded bg-muted px-1">{'{{amount_owed}}'}</code> — and you’ll be asked for it when using the template.
                Formatting: <code className="rounded bg-muted px-1"># Heading</code> <code className="rounded bg-muted px-1">**bold**</code> <code className="rounded bg-muted px-1">- bullet</code> <code className="rounded bg-muted px-1">1. numbered</code>
              </p>
            </div>
            <div className="space-y-2">
              {GROUPS.map((g) => (
                <div key={g} className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">{g}</span>
                  {PLACEHOLDERS.filter((p) => p.group === g).map((p) => (
                    <button key={p.key} type="button" onClick={() => insert(`{{${p.key}}}`)}
                      className="rounded-md border border-border bg-background px-2 py-0.5 text-xs hover:border-primary/50 hover:bg-primary/5">
                      {p.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={24} className="font-mono text-[13px] leading-relaxed" />
          </Card>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-primary" />
            <style>{LETTER_CSS}</style>
            <div className="letter max-h-[75vh] overflow-y-auto bg-white p-8 text-stone-900" dangerouslySetInnerHTML={{ __html: renderTemplate(body, {}, { preview: true }) }} />
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">Highlighted parts are filled in when the template is used.</p>
        </div>
      </div>
    </div>
  )
}
