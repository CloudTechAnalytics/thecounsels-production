import * as React from 'react'
import { format } from 'date-fns'
import { Download, ExternalLink, Printer, Pencil, Trash2, FileText, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { documentsService, type DocumentWithMatter } from '@/features/documents/services/documents.service'
import { useDeleteOrgDocument } from '@/features/documents/hooks/use-documents'
import { DocumentRenameDialog } from '@/features/documents/components/document-rename-dialog'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { formatStorage } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

function ext(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}
const OFFICE = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value || '—'}</p>
    </div>
  )
}

export function DocumentViewer({
  doc,
  open,
  onOpenChange,
}: {
  doc: DocumentWithMatter | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const del = useDeleteOrgDocument(activeOrgId)

  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [renaming, setRenaming] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    let active = true
    if (open && doc) {
      setLoading(true)
      setError(null)
      setUrl(null)
      documentsService
        .signedUrl(doc.storage_path, 3600)
        .then((u) => active && setUrl(u))
        .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load file'))
        .finally(() => active && setLoading(false))
    }
    return () => {
      active = false
    }
  }, [open, doc])

  const e = doc ? ext(doc.name) : ''
  const isPdf = e === 'pdf' || doc?.mime_type === 'application/pdf'
  const isImage = doc?.mime_type?.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)
  const isOffice = OFFICE.includes(e)

  const handlePrint = () => {
    if (!url) return
    const w = window.open(url, '_blank')
    if (w) w.onload = () => w.print()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4 pr-6">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate">{doc?.display_name}</span>
              </span>
              <span className="flex shrink-0 gap-2">
                {has('documents.update') && (
                  <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>
                    <Pencil className="h-4 w-4" /> Rename
                  </Button>
                )}
                {url && (
                  <>
                    <Button variant="outline" size="sm" onClick={handlePrint}>
                      <Printer className="h-4 w-4" /> Print
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" /> Open
                      </a>
                    </Button>
                    <Button asChild size="sm">
                      <a href={url} download={doc?.display_name}>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                  </>
                )}
                {has('documents.delete') && (
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
              </span>
            </DialogTitle>
          </DialogHeader>

          {doc && (
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <MetaItem label="Uploaded By" value={doc.uploaded_by_profile?.full_name} />
              <MetaItem label="Uploaded" value={format(new Date(doc.created_at), 'PP')} />
              <MetaItem label="Size" value={doc.size_bytes != null ? formatStorage(doc.size_bytes) : null} />
              <MetaItem label="Type" value={ext(doc.name) ? ext(doc.name).toUpperCase() : doc.mime_type} />
              <MetaItem label="Category" value={doc.category} />
              <MetaItem label="Matter" value={doc.matter ? `${doc.matter.matter_number}` : null} />
            </div>
          )}

          <div className="h-[65vh] w-full overflow-hidden rounded-lg border border-border bg-muted/40">
            {loading ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">{error}</div>
            ) : url && isPdf ? (
              <iframe title={doc?.display_name} src={url} className="h-full w-full" />
            ) : url && isImage ? (
              <div className="flex h-full items-center justify-center overflow-auto p-4">
                <img src={url} alt={doc?.display_name} className="max-h-full max-w-full object-contain" />
              </div>
            ) : url && isOffice ? (
              <iframe
                title={doc?.display_name}
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Preview isn't available for this file type.</p>
                {url && (
                  <Button asChild>
                    <a href={url} download={doc?.display_name}>
                      <Download className="h-4 w-4" /> Download to view
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Nested inside this DialogContent, not siblings after </Dialog>
           * — two independent Radix Dialog roots open at once causes the
           * outer one to dismiss itself when the inner one opens (same bug
           * fixed in assistant-dialog.tsx's Clear chat — see its own
           * comment). Both of these open while this viewer is already open,
           * so both need to live inside it, matching how
           * payment-detail-dialog.tsx nests its own ConfirmDialog. */}
          <DocumentRenameDialog doc={doc} open={renaming} onOpenChange={setRenaming} />

          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Delete document"
            destructive
            confirmLabel="Delete"
            loading={del.isPending}
            description={<>This permanently removes <strong>{doc?.display_name}</strong> from storage.</>}
            onConfirm={async () => {
              if (!doc) return
              try {
                await del.mutateAsync(doc)
                toast.success('Document deleted')
                setConfirmDelete(false)
                onOpenChange(false)
              } catch (err) {
                toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
