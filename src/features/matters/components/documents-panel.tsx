import * as React from 'react'
import { format } from 'date-fns'
import { UploadCloud, FileText, Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useDocuments, useUploadDocuments, useDeleteOrgDocument } from '@/features/documents/hooks/use-documents'
import { DocumentActionsMenu } from '@/features/documents/components/document-actions-menu'
import { DocumentRenameDialog } from '@/features/documents/components/document-rename-dialog'
import { DocumentViewer } from '@/features/matters/components/document-viewer'
import type { DocumentWithMatter } from '@/features/documents/services/documents.service'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { formatStorage } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*'

export function DocumentsPanel({ matterId, readOnly = false }: { matterId: string; readOnly?: boolean }) {
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const { data, isLoading } = useDocuments(activeOrgId, { matterId })
  const upload = useUploadDocuments(activeOrgId, profile?.id ?? null)
  const del = useDeleteOrgDocument(activeOrgId)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = React.useState(false)
  const [viewing, setViewing] = React.useState<DocumentWithMatter | null>(null)
  const [renaming, setRenaming] = React.useState<DocumentWithMatter | null>(null)
  const [toDelete, setToDelete] = React.useState<DocumentWithMatter | null>(null)

  const canUpload = has('documents.upload') && !readOnly
  const canRename = has('documents.update') && !readOnly
  const canDelete = has('documents.delete') && !readOnly

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 50 MB`)
        continue
      }
      try {
        await upload.mutateAsync({ file, matterId })
        toast.success(`Uploaded ${file.name}`)
      } catch (err) {
        toast.error(`Could not upload ${file.name}`, { description: err instanceof Error ? err.message : undefined })
      }
    }
  }

  return (
    <div className="space-y-4">
      {canUpload && (
        <Card
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
          {upload.isPending ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-7 w-7 text-primary" />
          )}
          <p className="text-sm font-medium">{upload.isPending ? 'Uploading…' : 'Drop files or click to upload'}</p>
          <p className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, images — up to 50 MB each</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border">
            {data.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(d)}>
                  <p className="truncate text-sm font-medium hover:underline">{d.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.size_bytes != null ? `${formatStorage(d.size_bytes)} · ` : ''}
                    {format(new Date(d.created_at), 'MMM d, yyyy')}
                  </p>
                </button>
                <DocumentActionsMenu
                  doc={d}
                  onView={() => setViewing(d)}
                  canRename={canRename}
                  canDelete={canDelete}
                  onRename={() => setRenaming(d)}
                  onDelete={() => setToDelete(d)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No documents yet. {canUpload ? 'Upload court orders, contracts, evidence and more.' : ''}
          </div>
        )}
      </Card>

      <DocumentViewer doc={viewing} open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)} />
      <DocumentRenameDialog doc={renaming} open={Boolean(renaming)} onOpenChange={(o) => !o && setRenaming(null)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete document"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This permanently removes <strong>{toDelete?.display_name}</strong> from storage.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync(toDelete)
            toast.success('Document deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
