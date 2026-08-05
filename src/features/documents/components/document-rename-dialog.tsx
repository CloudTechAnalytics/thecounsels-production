import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useUpdateDocument, useDocumentCategories } from '@/features/documents/hooks/use-documents'
import { DOCUMENT_CATEGORIES } from '@/features/documents/services/documents.service'
import { CategoryInput } from '@/features/documents/components/category-input'
import type { DocumentRow } from '@/shared/types/database.types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from '@/shared/components/ui/sonner'

export function DocumentRenameDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: DocumentRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId } = useAuth()
  const update = useUpdateDocument(activeOrgId)
  const { data: usedCategories } = useDocumentCategories(activeOrgId)
  const [displayName, setDisplayName] = React.useState('')
  const [category, setCategory] = React.useState('')

  const categorySuggestions = React.useMemo(() => {
    const extra = (usedCategories ?? []).filter((c) => !(DOCUMENT_CATEGORIES as readonly string[]).includes(c))
    return [...DOCUMENT_CATEGORIES, ...extra]
  }, [usedCategories])

  React.useEffect(() => {
    if (open && doc) {
      setDisplayName(doc.display_name)
      setCategory(doc.category ?? '')
    }
  }, [open, doc])

  const submit = async () => {
    if (!doc || !displayName.trim()) return
    try {
      await update.mutateAsync({
        doc,
        patch: { display_name: displayName.trim(), category: category.trim() || null },
      })
      toast.success('Document updated')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not update document', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename document</DialogTitle>
          <DialogDescription>The original file is untouched — this just changes how it's labeled.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Engagement Letter" />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <CategoryInput value={category} onChange={setCategory} suggestions={categorySuggestions} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending} disabled={!displayName.trim()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
