import * as React from 'react'
import { format } from 'date-fns'
import { FileText, UploadCloud, Trash2, Download } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployees, useMyHrDocuments, useEmployeeHrDocuments, useUploadHrDocument, useDeleteHrDocument } from '@/features/hr/hooks/use-hr'
import { hrService } from '@/features/hr/services/hr.service'
import { HR_DOCUMENT_CATEGORIES, type Employee, type HrDocumentRow } from '@/features/hr/types'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatStorage } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const categoryLabel = (v: string) => HR_DOCUMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v

function DocumentList({ documents, canDelete, userId, isLoading }: { documents: HrDocumentRow[] | undefined; canDelete: boolean; userId: string; isLoading: boolean }) {
  const { activeOrgId } = useAuth()
  const del = useDeleteHrDocument(activeOrgId)

  const open = async (doc: HrDocumentRow) => {
    try {
      const url = await hrService.getHrDocumentUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error('Could not open document', { description: errorMessage(err) })
    }
  }

  if (isLoading) return <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
  if (!documents || documents.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">No documents yet.</p>

  return (
    <ul className="divide-y divide-border">
      {documents.map((d) => (
        <li key={d.id} className="flex items-center gap-3 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-4 w-4" /></span>
          <button onClick={() => open(d)} className="min-w-0 flex-1 text-left hover:underline">
            <p className="truncate text-sm font-medium">{d.display_name}</p>
            <p className="text-xs text-muted-foreground">
              {categoryLabel(d.category)} · {d.size_bytes != null ? formatStorage(d.size_bytes) : ''} · {format(new Date(d.created_at), 'MMM d, yyyy')}
            </p>
          </button>
          <Button variant="ghost" size="icon" onClick={() => open(d)} aria-label="Download"><Download className="h-4 w-4" /></Button>
          {canDelete && (
            <Button
              variant="ghost" size="icon" aria-label="Delete"
              onClick={async () => {
                try { await del.mutateAsync({ id: d.id, storagePath: d.storage_path, userId }); toast.success('Document deleted') }
                catch (err) { toast.error('Could not delete', { description: errorMessage(err) }) }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function UploadForm({ userId }: { userId: string }) {
  const { activeOrgId, userId: currentUserId } = useAuth()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [category, setCategory] = React.useState(HR_DOCUMENT_CATEGORIES[0].value)
  const upload = useUploadHrDocument(activeOrgId, currentUserId)

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          {HR_DOCUMENT_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            await upload.mutateAsync({ userId, file, category })
            toast.success('Document uploaded')
          } catch (err) {
            toast.error('Could not upload', { description: errorMessage(err) })
          }
        }}
      />
      <Button variant="outline" size="sm" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
        <UploadCloud className="h-4 w-4" /> Upload
      </Button>
    </div>
  )
}

function EmployeeDocuments({ employee }: { employee: Employee }) {
  const { activeOrgId } = useAuth()
  const { data, isLoading } = useEmployeeHrDocuments(activeOrgId, employee.userId)
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-3">
        <p className="text-sm font-medium">{employee.fullName ?? employee.email}</p>
      </div>
      <UploadForm userId={employee.userId} />
      <DocumentList documents={data} canDelete userId={employee.userId} isLoading={isLoading} />
    </Card>
  )
}

/** HR (hr_documents.manage) sees every employee's documents, one at a time
 * via the picker; everyone else only ever sees their own — the RLS
 * policies already enforce this identically, this is just matching UI to
 * what the query can actually return. */
export function HrDocumentsPage() {
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('hr_documents.manage')
  const { data: employees } = useEmployees(canManage ? activeOrgId : null)
  const [selected, setSelected] = React.useState<string>('')
  const { data: myDocs, isLoading: myLoading } = useMyHrDocuments(activeOrgId, userId)

  const selectedEmployee = employees?.find((e) => e.userId === selected) ?? null

  return (
    <div>
      <PageHeader title="HR Documents" description="Employment contracts, certificates, and other employee records." />

      {canManage ? (
        <div className="space-y-4">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose an employee" /></SelectTrigger>
            <SelectContent>
              {employees?.map((e) => <SelectItem key={e.userId} value={e.userId}>{e.fullName ?? e.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedEmployee ? (
            <EmployeeDocuments employee={selectedEmployee} />
          ) : (
            <Card className="p-8 text-center text-sm text-muted-foreground">Choose an employee to view or upload their documents.</Card>
          )}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-border p-3">
            <p className="text-sm font-medium">My documents</p>
          </div>
          <DocumentList documents={myDocs} canDelete={false} userId={userId ?? ''} isLoading={myLoading} />
        </Card>
      )}
    </div>
  )
}
