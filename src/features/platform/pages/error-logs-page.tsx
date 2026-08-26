import * as React from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { Bug, Eraser, Search, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useClearErrorLogs, useDeleteErrorLog, useErrorLogs } from '@/features/platform/hooks/use-error-logs'
import { ERROR_LOGS_PAGE_SIZE, type ClientErrorLogRow, type ErrorLogFilters } from '@/features/platform/services/error-logs.service'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const ALL = 'all'
const ENVIRONMENTS = ['production', 'staging', 'development'] as const

function EnvBadge({ env }: { env: string | null }) {
  if (!env) return <Badge variant="muted">unknown</Badge>
  return <Badge variant={env === 'production' ? 'destructive' : env === 'staging' ? 'warning' : 'muted'}>{env}</Badge>
}

function ErrorDetailDialog({ row, onOpenChange }: { row: ClientErrorLogRow | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">{row?.message}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">When</p>
                <p className="font-medium">{format(new Date(row.created_at), 'MMM d, yyyy · HH:mm:ss')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Environment</p>
                <EnvBadge env={row.environment} />
              </div>
              <div>
                <p className="text-muted-foreground">Organization</p>
                <p className="font-medium">{row.organization?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Source</p>
                <p className="font-medium">{row.context?.source ?? '—'}</p>
              </div>
            </div>
            {row.url && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">URL</p>
                <p className="break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">{row.url}</p>
              </div>
            )}
            {row.context && Object.keys(row.context).length > (row.context.source ? 1 : 0) && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Context</p>
                <pre className="overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-xs">{JSON.stringify(row.context, null, 2)}</pre>
              </div>
            )}
            {row.stack && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Stack trace</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted px-2 py-1.5 font-mono text-xs">{row.stack}</pre>
              </div>
            )}
            {row.component_stack && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Component stack</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted px-2 py-1.5 font-mono text-xs">{row.component_stack}</pre>
              </div>
            )}
            {row.user_agent && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">User agent</p>
                <p className="break-all text-xs text-muted-foreground">{row.user_agent}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ErrorLogsPage() {
  const [search, setSearch] = React.useState('')
  const [environment, setEnvironment] = React.useState<string | 'all'>('all')
  const [page, setPage] = React.useState(1)
  const [viewing, setViewing] = React.useState<ClientErrorLogRow | null>(null)
  const [confirmClear, setConfirmClear] = React.useState(false)

  const filters: ErrorLogFilters = { search: search || undefined, environment }
  const { data, isLoading } = useErrorLogs(filters, page)
  const del = useDeleteErrorLog()
  const clear = useClearErrorLogs()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / ERROR_LOGS_PAGE_SIZE))

  return (
    <div>
      <PageHeader
        title="Error Logs"
        description="Client-side errors reported from every organization, no vendor account required."
        actions={
          <Button variant="outline" className="text-destructive hover:text-destructive" disabled={total === 0} onClick={() => setConfirmClear(true)}>
            <Eraser className="h-4 w-4" /> Clear all
          </Button>
        }
      />

      <div className="mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search error messages…" className="pl-9" />
        </div>
        <Select value={environment} onValueChange={(v) => { setEnvironment(v); setPage(1) }}>
          <SelectTrigger className="w-44 shrink-0"><SelectValue placeholder="All environments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All environments</SelectItem>
            {ENVIRONMENTS.map((e) => <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : rows.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                    <TableCell className="max-w-sm truncate text-sm font-medium">{r.message}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.context?.source ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.organization?.name ?? '—'}</TableCell>
                    <TableCell><EnvBadge env={r.environment} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={format(new Date(r.created_at), 'MMM d, yyyy · HH:mm:ss')}>
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete"
                        onClick={async (e) => {
                          e.stopPropagation()
                          try {
                            await del.mutateAsync(r.id)
                          } catch (err) {
                            toast.error('Could not delete', { description: errorMessage(err) })
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages} ({total} errors)</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <Bug className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No errors reported</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || environment !== 'all' ? 'No errors match your filters.' : "Nothing's been reported — that's a good sign."}
            </p>
          </div>
        )}
      </Card>

      <ErrorDetailDialog row={viewing} onOpenChange={(o) => !o && setViewing(null)} />

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all error logs"
        destructive
        confirmPhrase="CLEAR ERROR LOGS"
        confirmLabel="Clear all"
        loading={clear.isPending}
        description="This permanently deletes every logged error across the entire platform — every organization's reports, not just what's shown here. This cannot be undone."
        onConfirm={async () => {
          try {
            await clear.mutateAsync()
            toast.success('Error logs cleared')
            setConfirmClear(false)
          } catch (err) {
            toast.error('Could not clear error logs', { description: errorMessage(err) })
          }
        }}
      />
    </div>
  )
}
