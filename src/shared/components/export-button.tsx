import { Download, ChevronDown } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { exportToExcel, exportToCsv, type ExportSheet } from '@/shared/lib/export-excel'
import { toast } from '@/shared/components/ui/sonner'

/**
 * "Export" button for data tables — builds an .xlsx (and optionally offers a
 * CSV download) from the rows currently shown (i.e. after search/filters/
 * permission trimming) and downloads it.
 */
export function ExportButton({
  filename,
  sheets,
  label = 'Export',
  disabled,
  csv = false,
}: {
  filename: string
  /** Sheets to write; pass a function when rows are expensive to build, or async to fetch them fresh (e.g. the full filtered set behind pagination). */
  sheets: ExportSheet[] | (() => ExportSheet[] | Promise<ExportSheet[]>)
  label?: string
  disabled?: boolean
  /** Also offer a CSV download alongside Excel — uses the first sheet only, since CSV has no multi-tab concept. */
  csv?: boolean
}) {
  const resolve = async () => {
    const resolved = typeof sheets === 'function' ? await sheets() : sheets
    const total = resolved.reduce((s, sh) => s + sh.rows.length, 0)
    return { resolved, total }
  }

  const runExcel = async () => {
    try {
      const { resolved, total } = await resolve()
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

  const runCsv = async () => {
    try {
      const { resolved } = await resolve()
      const sheet = resolved[0]
      if (!sheet || sheet.rows.length === 0) {
        toast.info('Nothing to export')
        return
      }
      exportToCsv(filename, sheet)
      toast.success(`Exported ${sheet.rows.length} row${sheet.rows.length === 1 ? '' : 's'}`)
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined })
    }
  }

  if (!csv) {
    return (
      <Button variant="outline" onClick={runExcel} disabled={disabled}>
        <Download /> {label}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Download /> {label} <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={runExcel}>Export Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={runCsv}>Export CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
