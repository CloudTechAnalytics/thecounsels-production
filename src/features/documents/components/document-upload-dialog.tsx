import * as React from 'react'
import { UploadCloud, Loader2, FileText, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useUploadDocuments, useDocumentCategories } from '@/features/documents/hooks/use-documents'
import { DOCUMENT_CATEGORIES } from '@/features/documents/services/documents.service'
import { CategoryInput } from '@/features/documents/components/category-input'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { formatStorage } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'
import { friendlyErrorMessage } from '@/shared/lib/errors'
import { isMatterClosed } from '@/features/matters/types'

const NONE = '__none__'
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*'

function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}

interface QueuedFile {
  file: File
  displayName: string
}

export function DocumentUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeOrgId, profile } = useAuth()
  const { data: allMatters } = useMatters(activeOrgId, {})
  // A closed matter is read-only — filing a new document under one would
  // always fail, so it's excluded here rather than left to error out.
  const matters = React.useMemo(() => (allMatters ?? []).filter((m) => !isMatterClosed(m.status)), [allMatters])
  const { data: usedCategories } = useDocumentCategories(activeOrgId)
  const upload = useUploadDocuments(activeOrgId, profile?.id ?? null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [files, setFiles] = React.useState<QueuedFile[]>([])
  const [category, setCategory] = React.useState('')
  const [matterId, setMatterId] = React.useState<string>(NONE)

  const categorySuggestions = React.useMemo(() => {
    const extra = (usedCategories ?? []).filter((c) => !(DOCUMENT_CATEGORIES as readonly string[]).includes(c))
    return [...DOCUMENT_CATEGORIES, ...extra]
  }, [usedCategories])

  React.useEffect(() => {
    if (open) {
      setFiles([])
      setCategory('')
      setMatterId(NONE)
    }
  }, [open])

  const submit = async () => {
    if (files.length === 0) {
      toast.error('Choose at least one file')
      return
    }
    let ok = 0
    for (const { file, displayName } of files) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 50 MB`)
        continue
      }
      try {
        await upload.mutateAsync({
          file,
          displayName,
          category: category.trim() || null,
          matterId: matterId === NONE ? null : matterId,
        })
        ok++
      } catch (err) {
        toast.error(`Could not upload ${file.name}`, { description: friendlyErrorMessage(err) })
      }
    }
    if (ok > 0) {
      toast.success(`Uploaded ${ok} document${ok > 1 ? 's' : ''}`)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload documents</DialogTitle>
          <DialogDescription>Store files securely and optionally file them under a matter.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center hover:border-primary/40"
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const added = Array.from(e.target.files ?? []).map((file) => ({
                  file,
                  displayName: stripExtension(file.name),
                }))
                setFiles((prev) => [...prev, ...added])
                e.target.value = ''
              }}
            />
            <UploadCloud className="h-7 w-7 text-primary" />
            <p className="text-sm font-medium">Click to choose files</p>
            <p className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, images — up to 50 MB each</p>
          </div>

          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <Input
                    value={f.displayName}
                    onChange={(e) =>
                      setFiles((prev) => prev.map((qf, j) => (j === i ? { ...qf, displayName: e.target.value } : qf)))
                    }
                    className="h-7 min-w-0 flex-1"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">{formatStorage(f.file.size)}</span>
                  <button onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove">
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <CategoryInput value={category} onChange={setCategory} suggestions={categorySuggestions} />
            </div>
            <div className="space-y-1.5">
              <Label>Matter (optional)</Label>
              <Select value={matterId} onValueChange={setMatterId}>
                <SelectTrigger><SelectValue placeholder="No matter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No matter</SelectItem>
                  {matters?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.matter_number} — {m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={upload.isPending}>
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upload {files.length > 0 ? `(${files.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
