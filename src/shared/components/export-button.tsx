import { Download } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { exportToExcel, type ExportSheet } from '@/shared/lib/export-excel'
import { toast } from '@/shared/components/ui/sonner'

/**
 * "Export" button for data tables — builds an .xlsx from the rows currently
 * shown (i.e. after search/filters/permission trimming) and downloads it.
 */
export function ExportButton({
  filename,
  sheets,
  label = 'Export',
  disabled,
}: {
  filename: string
  /** Sheets to write; pass a function when rows are expensive to build, or async to fetch them fresh (e.g. the full filtered set behind pagination). */
  sheets: ExportSheet[] | (() => ExportSheet[] | Promise<ExportSheet[]>)
  label?: string
  disabled?: boolean
}) {
  const onClick = async () => {
    try {
      const resolved = typeof sheets === 'function' ? await sheets() : sheets
      const total = resolved.reduce((s, sh) => s + sh.rows.length, 0)
      if (total === 0) {
        toast.info('Nothing to export')
        return
      }
      exportToExcel(filename, resolved)
      toast.success(`Exported ${total} row${total === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={disabled}>
      <Download /> {label}
    </Button>
  )
}
