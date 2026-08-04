import { Eye, Download, Pencil, Trash2, MoreHorizontal } from 'lucide-react'
import { documentsService } from '@/features/documents/services/documents.service'
import { triggerDownload } from '@/features/documents/lib/download'
import type { DocumentRow } from '@/shared/types/database.types'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { toast } from '@/shared/components/ui/sonner'

export function DocumentActionsMenu({
  doc,
  onView,
  canRename,
  canDelete,
  onRename,
  onDelete,
}: {
  doc: DocumentRow
  onView: () => void
  canRename: boolean
  canDelete: boolean
  onRename: () => void
  onDelete: () => void
}) {
  const handleDownload = async () => {
    try {
      const url = await documentsService.signedUrl(doc.storage_path)
      triggerDownload(url, doc.display_name)
    } catch (err) {
      toast.error('Could not download', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>
          <Eye /> View
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleDownload}>
          <Download /> Download
        </DropdownMenuItem>
        {canRename && (
          <DropdownMenuItem onClick={onRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
