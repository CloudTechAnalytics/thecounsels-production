import * as React from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, UploadCloud, FileText, Eye, Trash2, MoreHorizontal, FolderOpen } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useDocuments, useDeleteOrgDocument } from '@/features/documents/hooks/use-documents'
import { DocumentUploadDialog } from '@/features/documents/components/document-upload-dialog'
import { DOCUMENT_CATEGORIES, type DocumentFilters, type DocumentWithMatter } from '@/features/documents/services/documents.service'
import { DocumentViewer } from '@/features/matters/components/document-viewer'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { formatStorage } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

export function DocumentsPage() {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState<DocumentFilters['category']>('all')
  const [matterId, setMatterId] = React.useState<DocumentFilters['matterId']>('all')
  const { data, isLoading } = useDocuments(activeOrgId, { search, category, matterId })
  const { data: matters } = useMatters(activeOrgId, {})
  const del = useDeleteOrgDocument(activeOrgId)

  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [viewing, setViewing] = React.useState<DocumentWithMatter | null>(null)
  const [toDelete, setToDelete] = React.useState<DocumentWithMatter | null>(null)

  const canUpload = has('documents.upload')
  const canDelete = has('documents.delete')

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Every file across the firm — contracts, court orders, evidence and more."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton
              filename="documents"
              disabled={!data?.length}
              sheets={() => [{
                name: 'Documents',
                rows: (data ?? []).map((d) => ({
                  Name: d.name,
                  Category: d.category ?? '',
                  Matter: d.matter?.matter_number ?? 'General',
                  Size: d.size_bytes != null ? formatStorage(d.size_bytes) : '',
                  Uploaded: d.created_at.slice(0, 10),
                })),
              }]}
            />
            {canUpload && <Button onClick={() => setUploadOpen(true)}><UploadCloud className="h-4 w-4" /> Upload</Button>}
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" className="pl-9" />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v)}>
          <SelectTrigger className="w-full lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {DOCUMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={matterId} onValueChange={(v) => setMatterId(v)}>
          <SelectTrigger className="w-full lg:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All matters</SelectItem>
            {matters?.map((m) => <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Matter</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <button className="flex items-center gap-3 text-left" onClick={() => setViewing(d)}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="truncate text-sm font-medium hover:underline">{d.name}</span>
                    </button>
                  </TableCell>
                  <TableCell>{d.category ? <Badge variant="outline">{d.category}</Badge> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    {d.matter ? (
                      <Link to={`/matters/${d.matter.id}`} className="text-sm text-primary hover:underline">{d.matter.matter_number}</Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">General</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.size_bytes != null ? formatStorage(d.size_bytes) : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(d.created_at), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(d)}><Eye className="h-4 w-4" /> View</Button>
                      {canDelete && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(d)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <FolderOpen className="h-7 w-7" />
            </span>
            <p className="font-display text-lg font-semibold">
              {search || category !== 'all' || matterId !== 'all' ? 'No documents match your filters' : 'No documents yet'}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">Upload contracts, court orders, evidence and correspondence.</p>
            {canUpload && <Button onClick={() => setUploadOpen(true)} className="mt-1"><UploadCloud className="h-4 w-4" /> Upload</Button>}
          </div>
        )}
      </Card>

      <DocumentUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <DocumentViewer doc={viewing} open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete document"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This permanently removes <strong>{toDelete?.name}</strong> from storage.</>}
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
