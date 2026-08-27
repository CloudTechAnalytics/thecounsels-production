import { formatDistanceToNow, format } from 'date-fns'
import { Download, FileJson, Loader2 } from 'lucide-react'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useDataExportRequests, useRequestDataExport } from '@/features/administration/hooks/use-data-export'
import { dataExportService } from '@/features/administration/services/data-export.service'
import type { DataExportStatus } from '@/shared/types/database.types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const STATUS_META: Record<DataExportStatus, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Queued', variant: 'muted' },
  processing: { label: 'Preparing…', variant: 'warning' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
}

/** Firm Settings → Data Export. Fulfills the Privacy Policy's own
 * portability promise (/privacy Section 12) with a real button instead of
 * "email us and someone will run a SQL query." Curated by matter, not a
 * raw table dump — see generate-data-export's own header comment for
 * exactly what's included and what's deliberately deferred. */
export function DataExportPanel({ organizationId }: { organizationId: string | null }) {
  const { has } = usePermissions()
  const canManage = has('organization.manage')
  const { data: requests, isLoading } = useDataExportRequests(organizationId)
  const request = useRequestDataExport(organizationId)

  const active = requests?.find((r) => r.status === 'pending' || r.status === 'processing')

  if (!canManage) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Only your firm's administrators can request a data export.
      </Card>
    )
  }

  const download = async (filePath: string) => {
    try {
      const url = await dataExportService.getDownloadUrl(filePath)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error('Could not get download link', { description: errorMessage(err) })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base font-semibold">Export your firm's data</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A complete, organized copy of your matters, clients, documents, and billing records — grouped
            the way your practice actually works, not a raw database dump. Takes a few minutes; ready files
            are available to download for {' '}7 days.
          </p>
        </div>
        <Button
          className="shrink-0"
          loading={request.isPending}
          disabled={Boolean(active)}
          onClick={async () => {
            try {
              await request.mutateAsync()
              toast.success('Export started', { description: "We'll have it ready shortly." })
            } catch (err) {
              toast.error('Could not start export', { description: errorMessage(err) })
            }
          }}
        >
          <FileJson className="h-4 w-4" /> {active ? 'Export in progress…' : 'Request export'}
        </Button>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : requests && requests.length > 0 ? (
          <ul className="divide-y divide-border/70">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                {r.status === 'processing' ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : (
                  <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    Requested by {r.requester?.full_name ?? 'a team member'} ·{' '}
                    <span title={format(new Date(r.requested_at), 'MMM d, yyyy · HH:mm')}>
                      {formatDistanceToNow(new Date(r.requested_at), { addSuffix: true })}
                    </span>
                  </p>
                  {r.status === 'failed' && r.error && <p className="mt-0.5 text-xs text-destructive">{r.error}</p>}
                  {r.status === 'ready' && r.expires_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Available until {format(new Date(r.expires_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                <Badge variant={STATUS_META[r.status].variant}>{STATUS_META[r.status].label}</Badge>
                {r.status === 'ready' && r.file_path && (
                  <Button size="sm" variant="outline" onClick={() => download(r.file_path!)}>
                    <Download className="h-4 w-4" /> Download
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            No exports requested yet.
          </div>
        )}
      </Card>
    </div>
  )
}
