import * as XLSX from 'xlsx'

export interface ExportSheet {
  /** Sheet tab name (Excel limit: 31 chars, no \ / ? * [ ]). */
  name: string
  /** Row objects — keys become the header row, in key order of the first row. */
  rows: Record<string, unknown>[]
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet'
}

/** Column widths sized to the longest value (capped so one long cell can't blow up the layout). */
function columnWidths(rows: Record<string, unknown>[]): { wch: number }[] {
  const keys = Object.keys(rows[0] ?? {})
  return keys.map((k) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[k] ?? '').length), k.length)
    return { wch: Math.min(Math.max(longest + 2, 10), 60) }
  })
}

/**
 * Build an .xlsx workbook from one or more sheets and trigger a download.
 * Empty sheets are kept (header-only) so the file structure is predictable.
 */
export function exportToExcel(filename: string, sheets: ExportSheet[]): void {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows)
    ws['!cols'] = columnWidths(sheet.rows)
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name))
  }
  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${filename}-${stamp}.xlsx`)
}

/**
 * Download a single sheet as CSV. Unlike .xlsx, CSV has no concept of multiple
 * tabs, so only the first sheet is used — callers with multiple sheets should
 * pick the one that matters most, or export to Excel instead.
 */
export function exportToCsv(filename: string, sheet: ExportSheet): void {
  const ws = XLSX.utils.json_to_sheet(sheet.rows)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
