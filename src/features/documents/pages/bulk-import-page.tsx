import * as React from 'react'
import { Link } from 'react-router-dom'
import {
  UploadCloud,
  FileText,
  X,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useDocumentCategories } from '@/features/documents/hooks/use-documents'
import { documentsService, DOCUMENT_CATEGORIES } from '@/features/documents/services/documents.service'
import { CategoryInput } from '@/features/documents/components/category-input'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatStorage } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'
import { useQueryClient } from '@tanstack/react-query'

const NONE = '__none__'
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*'
const MAX_FILE_BYTES = 50 * 1024 * 1024
// Parallel uploads at once — fast enough for a real migration without
// hammering Storage or the browser's own connection limit.
const CONCURRENCY = 4

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

type Status = 'pending' | 'uploading' | 'done' | 'error' | 'too_large'

interface QueuedFile {
  id: string
  file: File
  displayName: string
  matterId: string
  category: string
  status: Status
  error?: string
}

/** Runs `worker` over `items` with at most `limit` in flight at once,
 * calling `onSettle` as each one finishes (not just at the very end) so the
 * UI can update live rather than freezing until the whole batch completes. */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  async function next(): Promise<void> {
    const i = index++
    if (i >= items.length) return
    await worker(items[i])
    await next()
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()))
}

/**
 * Dedicated page (not a modal — a modal doesn't hold up at hundreds/
 * thousands-of-files scale) for migrating an existing archive into The
 * Counsel. Batch-assign a default matter/category to everything, then fix
 * exceptions per row before importing. Uploads run client-side with bounded
 * concurrency — this tab must stay open for the whole import; anything
 * already uploaded when the tab closes stays uploaded, so re-running the
 * import safely picks up just what's left (already-successful rows are
 * simply removed from the queue, never re-sent).
 */
export function BulkImportPage() {
  const { activeOrgId, profile } = useAuth()
  const { data: matters } = useMatters(activeOrgId, {})
  const { data: usedCategories } = useDocumentCategories(activeOrgId)
  const qc = useQueryClient()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [files, setFiles] = React.useState<QueuedFile[]>([])
  const [defaultMatterId, setDefaultMatterId] = React.useState<string>(NONE)
  const [defaultCategory, setDefaultCategory] = React.useState('')
  const [running, setRunning] = React.useState(false)

  const categorySuggestions = React.useMemo(() => {
    const extra = (usedCategories ?? []).filter((c) => !(DOCUMENT_CATEGORIES as readonly string[]).includes(c))
    return [...DOCUMENT_CATEGORIES, ...extra]
  }, [usedCategories])

  // Guard against losing an in-progress migration to an accidental tab close.
  React.useEffect(() => {
    if (!running) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [running])

  const addFiles = (list: FileList | null) => {
    const added = Array.from(list ?? []).map((file) => ({
      id: crypto.randomUUID(),
      file,
      displayName: stripExtension(file.name),
      matterId: defaultMatterId,
      category: defaultCategory,
      status: (file.size > MAX_FILE_BYTES ? 'too_large' : 'pending') as Status,
      error: file.size > MAX_FILE_BYTES ? `Larger than ${formatStorage(MAX_FILE_BYTES)}` : undefined,
    }))
    setFiles((prev) => [...prev, ...added])
  }

  /** Re-applies the current batch defaults to every row that hasn't already
   * been individually overridden is intentionally NOT tracked — this always
   * overwrites all rows, since "apply to all" is meant as a bulk reset. */
  const applyDefaultsToAll = () => {
    setFiles((prev) => prev.map((f) => (f.status === 'done' ? f : { ...f, matterId: defaultMatterId, category: defaultCategory })))
    toast.success('Applied to all files')
  }

  const updateFile = (id: string, patch: Partial<QueuedFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const startImport = async (retryOnly = false) => {
    const toRun = files.filter((f) => (retryOnly ? f.status === 'error' : f.status === 'pending'))
    if (toRun.length === 0) return
    setRunning(true)
    setFiles((prev) => prev.map((f) => (toRun.some((t) => t.id === f.id) ? { ...f, status: 'uploading', error: undefined } : f)))

    await runWithConcurrency(toRun, CONCURRENCY, async (item) => {
      try {
        await documentsService.upload({
          organizationId: activeOrgId!,
          file: item.file,
          uploadedBy: profile?.id ?? null,
          displayName: item.displayName,
          category: item.category.trim() || null,
          matterId: item.matterId === NONE ? null : item.matterId,
        })
        updateFile(item.id, { status: 'done' })
      } catch (err) {
        updateFile(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
      }
    })

    setRunning(false)
    qc.invalidateQueries({ queryKey: ['org-documents', activeOrgId] })
  }

  const counts = React.useMemo(() => {
    const c = { pending: 0, uploading: 0, done: 0, error: 0, too_large: 0 }
    for (const f of files) c[f.status]++
    return c
  }, [files])
  const importable = counts.pending > 0
  const hasFailed = counts.error > 0

  return (
    <div>
      <PageHeader
        title="Bulk Import"
        description="Migrate an existing archive into The Counsel — hundreds of files at once."
        actions={
          <Button variant="outline" asChild>
            <Link to="/documents"><ArrowLeft className="h-4 w-4" /> Back to Documents</Link>
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm font-medium">1. Set defaults for this batch</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategoryInput value={defaultCategory} onChange={setDefaultCategory} suggestions={categorySuggestions} />
          </div>
          <div className="space-y-1.5">
            <Label>Matter</Label>
            <Select value={defaultMatterId} onValueChange={setDefaultMatterId}>
              <SelectTrigger><SelectValue placeholder="No matter" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No matter</SelectItem>
                {matters?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={applyDefaultsToAll} disabled={files.length === 0}>
              Apply to all
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Applies to every file you add below. Override an individual file's matter/category in its row if it doesn't belong with the rest.
        </p>
      </Card>

      <Card className="mb-4 p-4">
        <p className="mb-3 text-sm font-medium">2. Add files</p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center hover:border-primary/40"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
          />
          <UploadCloud className="h-8 w-8 text-primary" />
          <p className="text-sm font-medium">Click to choose files, or drag and drop</p>
          <p className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, images — up to {formatStorage(MAX_FILE_BYTES)} each. Select as many as you like.</p>
        </div>
      </Card>

      {files.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{files.length} file{files.length > 1 ? 's' : ''}</span>
              {counts.done > 0 && <Badge variant="success">{counts.done} done</Badge>}
              {counts.error > 0 && <Badge variant="destructive">{counts.error} failed</Badge>}
              {counts.too_large > 0 && <Badge variant="outline">{counts.too_large} too large</Badge>}
              {counts.uploading > 0 && <Badge variant="default">{counts.uploading} uploading…</Badge>}
            </div>
            <div className="flex gap-2">
              {hasFailed && !running && (
                <Button variant="outline" size="sm" onClick={() => startImport(true)}>
                  <RotateCcw className="h-4 w-4" /> Retry failed
                </Button>
              )}
              <Button size="sm" onClick={() => startImport(false)} disabled={!importable || running} loading={running}>
                Import {counts.pending > 0 ? `(${counts.pending})` : ''}
              </Button>
            </div>
          </div>

          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {files.map((f) => (
              <li key={f.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {f.status === 'done' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> :
                   f.status === 'error' || f.status === 'too_large' ? <XCircle className="h-4 w-4 shrink-0 text-destructive" /> :
                   f.status === 'uploading' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" /> :
                   <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <Input
                    value={f.displayName}
                    disabled={f.status === 'done' || f.status === 'uploading'}
                    onChange={(e) => updateFile(f.id, { displayName: e.target.value })}
                    className="h-8 min-w-0 flex-1"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">{formatStorage(f.file.size)}</span>
                </div>
                <div className="flex items-center gap-2 sm:w-40">
                  <Input
                    value={f.category}
                    disabled={f.status === 'done' || f.status === 'uploading'}
                    placeholder="Category"
                    onChange={(e) => updateFile(f.id, { category: e.target.value })}
                    className="h-8"
                  />
                </div>
                <div className="flex items-center gap-2 sm:w-52">
                  <Select
                    value={f.matterId}
                    onValueChange={(v) => updateFile(f.id, { matterId: v })}
                    disabled={f.status === 'done' || f.status === 'uploading'}
                  >
                    <SelectTrigger className="h-8"><SelectValue placeholder="No matter" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>No matter</SelectItem>
                      {matters?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.matter_number}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {f.error && <p className="text-xs text-destructive sm:w-40 sm:shrink-0">{f.error}</p>}
                {f.status !== 'done' && f.status !== 'uploading' && (
                  <button onClick={() => removeFile(f.id)} aria-label="Remove" className="shrink-0">
                    <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
