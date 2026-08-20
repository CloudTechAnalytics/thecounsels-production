import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { HardDrive } from 'lucide-react'
import { useStorageUsage, useStorageBreakdown, useLargestFiles } from '@/shared/hooks/use-storage-quota'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Progress } from '@/shared/components/ui/progress'
import { formatStorage } from '@/shared/lib/format'

const CATEGORY_LABELS: Record<string, string> = {
  documents: 'Documents',
  matterAttachments: 'Matter attachments',
  hrDocuments: 'HR documents',
  expenseReceipts: 'Expense receipts',
}

const SOURCE_LABELS: Record<string, string> = {
  document: 'Document',
  expense_receipt: 'Expense receipt',
  hr_document: 'HR document',
}

/** Firm Settings -> Storage. Read-only for everyone who can see this tab
 * (no destructive action here in this pass) — gated at the page level by
 * the same organization.view the whole Administration page already
 * requires. All figures come from security-definer RPCs (migration 0108),
 * so they're accurate regardless of the viewer's own billing/HR permission
 * scope, not silently truncated by their own RLS. */
export function StorageManagement({ organizationId }: { organizationId: string | null }) {
  const { usedBytes, limitBytes, isLoading } = useStorageUsage(organizationId)
  const { data: breakdown, isLoading: breakdownLoading } = useStorageBreakdown(organizationId)
  const { data: largestFiles, isLoading: filesLoading } = useLargestFiles(organizationId)

  if (isLoading) return <Skeleton className="h-64 w-full rounded-lg" />

  const percent = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0
  const remainingBytes = Math.max(0, limitBytes - usedBytes)
  const overLimit = limitBytes > 0 && usedBytes > limitBytes

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <h3 className="font-display text-xl font-semibold">Storage usage</h3>
        </div>

        <p className="mt-4 text-2xl font-display font-semibold">
          {formatStorage(usedBytes)} <span className="text-base font-normal text-muted-foreground">/ {limitBytes > 0 ? formatStorage(limitBytes) : 'no limit'} used</span>
        </p>
        {limitBytes > 0 && (
          <>
            <Progress value={percent} className="mt-3" />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{percent.toFixed(1)}% used</span>
              <span>{formatStorage(remainingBytes)} remaining</span>
            </div>
          </>
        )}

        {overLimit ? (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Your organization has exceeded its storage allowance ({formatStorage(usedBytes)} of {formatStorage(limitBytes)} used).
            Existing files remain safe and accessible, but new uploads are blocked until you free up space or upgrade your storage plan.
          </p>
        ) : percent >= 90 ? (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Storage almost full — {formatStorage(usedBytes)} of {formatStorage(limitBytes)} used. Uploads may soon be blocked.
          </p>
        ) : percent >= 75 ? (
          <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
            You've used {percent.toFixed(0)}% of your storage allowance. Consider removing unused files or upgrading your plan.
          </p>
        ) : null}
      </Card>

      <Card className="space-y-3 p-6 text-sm">
        <p className="font-display text-base font-semibold">Breakdown by category</p>
        {breakdownLoading || !breakdown ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <div key={key} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{formatStorage(breakdown[key as keyof typeof breakdown])}</span>
            </div>
          ))
        )}
      </Card>

      <Card className="p-6 lg:col-span-3">
        <p className="font-display text-base font-semibold">Largest files</p>
        <p className="mt-1 text-xs text-muted-foreground">The 20 largest files across your organization — a quick way to spot what's worth cleaning up.</p>
        {filesLoading ? (
          <Skeleton className="mt-4 h-40 w-full" />
        ) : !largestFiles?.length ? (
          <p className="mt-4 text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">File</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Uploaded</th>
                  <th className="pb-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {largestFiles.map((f) => (
                  <tr key={`${f.source}-${f.id}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      {f.source === 'document' && f.matterId ? (
                        <Link to={`/matters/${f.matterId}`} className="font-medium text-primary hover:underline">{f.name}</Link>
                      ) : (
                        <span className="font-medium">{f.name}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{SOURCE_LABELS[f.source] ?? f.source}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{formatStorage(f.sizeBytes)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{format(new Date(f.createdAt), 'PP')}</td>
                    <td className="py-2 text-muted-foreground">{f.uploadedByName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
