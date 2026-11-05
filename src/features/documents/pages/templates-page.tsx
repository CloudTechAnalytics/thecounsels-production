import * as React from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { FileSignature, Plus, Pencil, Trash2, Sparkles, ArrowLeft, Search } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useAddStarterTemplates, useDeleteTemplate, useDocumentTemplates, type DocumentTemplate } from '@/features/documents/hooks/use-templates'
import { placeholderKeys, STARTER_TEMPLATES } from '@/features/documents/lib/templates'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function TemplatesPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const matterId = params.get('matter')
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const canEdit = has('documents.manage')
  const { data: templates = [], isLoading } = useDocumentTemplates(activeOrgId)
  const addStarters = useAddStarterTemplates(activeOrgId)
  const del = useDeleteTemplate(activeOrgId)
  const [search, setSearch] = React.useState('')
  const [toDelete, setToDelete] = React.useState<DocumentTemplate | null>(null)

  const shown = templates.filter((t) => `${t.name} ${t.category ?? ''} ${t.description ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const missingStarters = STARTER_TEMPLATES.filter((s) => !templates.some((t) => t.name === s.name)).length
  const useHref = (id: string) => `/documents/templates/${id}/use${matterId ? `?matter=${matterId}` : ''}`

  const runStarters = async () => {
    try {
      const n = await addStarters.mutateAsync(templates.map((t) => t.name))
      toast.success(n ? `${n} starter template${n === 1 ? '' : 's'} added` : 'You already have all the starter templates', { description: n ? 'Review the wording and adapt it to your firm before use.' : undefined })
    } catch (err) { toast.error('Could not add templates', { description: errorMessage(err) }) }
  }

  return (
    <div>
      <Link to={matterId ? `/matters/${matterId}` : '/documents'} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {matterId ? 'Back to matter' : 'Documents'}
      </Link>
      <PageHeader
        title="Document templates"
        description="Letters and documents your firm uses again and again — filled in from the client and matter, signed with your e-signature, ready to print, send or save."
        actions={canEdit ? (
          <div className="flex flex-wrap gap-2">
            {missingStarters > 0 && <Button variant="outline" onClick={runStarters} loading={addStarters.isPending}><Sparkles className="h-4 w-4" /> Add starter templates</Button>}
            <Button onClick={() => navigate('/documents/templates/new')}><Plus className="h-4 w-4" /> New template</Button>
          </div>
        ) : undefined}
      />

      {matterId && <p className="mb-4 rounded-lg bg-primary/5 px-4 py-2.5 text-sm">Choose a template — it will be filled in from this matter and its client.</p>}

      {templates.length > 4 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : templates.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileSignature className="h-6 w-6" /></span>
          <p className="font-medium">No templates yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            {canEdit
              ? 'Start with our Nigerian starter set — engagement letter, letter of demand, acknowledgement of instructions, adjournment update, letter of authority and CTC request — or write your own.'
              : 'Ask a partner or administrator to add your firm’s templates.'}
          </p>
          {canEdit && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={runStarters} loading={addStarters.isPending}><Sparkles className="h-4 w-4" /> Add starter templates</Button>
              <Button variant="outline" onClick={() => navigate('/documents/templates/new')}><Plus className="h-4 w-4" /> Write my own</Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => {
            const fields = placeholderKeys(t.body).length
            return (
              <Card key={t.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileSignature className="h-4 w-4" /></span>
                  {t.category && <Badge variant="secondary" className="font-normal">{t.category}</Badge>}
                </div>
                <p className="mt-3 font-semibold">{t.name}</p>
                {t.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                <p className="mt-2 text-xs text-muted-foreground">{fields} field{fields === 1 ? '' : 's'} · updated {formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</p>
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <Button size="sm" className="flex-1" onClick={() => navigate(useHref(t.id))}>Use template</Button>
                  {canEdit && <Button size="sm" variant="outline" onClick={() => navigate(`/documents/templates/${t.id}/edit`)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>}
                  {canEdit && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setToDelete(t)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete template"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>Delete <strong>{toDelete?.name}</strong>? Documents already created from it are not affected.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try { await del.mutateAsync(toDelete.id); toast.success('Template deleted'); setToDelete(null) }
          catch (err) { toast.error('Could not delete', { description: errorMessage(err) }) }
        }}
      />
    </div>
  )
}
