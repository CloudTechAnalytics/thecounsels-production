import * as React from 'react'
import { format } from 'date-fns'
import { Eraser } from 'lucide-react'
import { useClearAuditLog, usePlatformActivity } from '@/features/platform/hooks/use-platform'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { titleCase } from '@/shared/lib/format'
import { errorMessage } from '@/shared/lib/errors'
import { toast } from '@/shared/components/ui/sonner'

export function AuditLogsPage() {
  const { data, isLoading } = usePlatformActivity()
  const clear = useClearAuditLog()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const doClear = async () => {
    try {
      await clear.mutateAsync()
      toast.success('Audit log cleared')
      setConfirmOpen(false)
    } catch (err) {
      toast.error('Could not clear the audit log', { description: errorMessage(err) })
    }
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Every recorded action across the platform."
        actions={
          <Button variant="outline" className="text-destructive hover:text-destructive" disabled={!data?.length} onClick={() => setConfirmOpen(true)}>
            <Eraser className="h-4 w-4" /> Clear audit log
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Badge variant="muted">{a.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.summary ?? titleCase(a.action.replace('.', ' '))}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.entity_type ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(a.created_at), 'MMM d, yyyy · HH:mm')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">No audit entries yet.</div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Clear audit log"
        destructive
        confirmPhrase="CLEAR AUDIT LOG"
        confirmLabel="Clear audit log"
        loading={clear.isPending}
        description={
          <>
            This permanently deletes every recorded audit entry across the entire platform — every organization's
            activity, not just the rows shown here. One new entry recording that you cleared it (and when) will be
            written immediately after. This cannot be undone.
          </>
        }
        onConfirm={doClear}
      />
    </div>
  )
}
