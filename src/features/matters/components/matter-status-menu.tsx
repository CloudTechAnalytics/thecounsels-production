import { LockOpen } from 'lucide-react'
import { MATTER_STATUS_META, MATTER_STATUSES, isMatterClosed } from '@/features/matters/types'
import type { MatterStatus } from '@/shared/types/database.types'
import { Badge } from '@/shared/components/ui/badge'
import { StatusBadgeMenu } from '@/shared/components/status-badge-menu'

/**
 * Matter's quick-status control — branches on a real constraint the plain
 * StatusBadgeMenu can't handle on its own: matters_update RLS (migration
 * 0050) blocks ANY update once a matter is closed/won/lost, by design —
 * the only way out is the existing reopen_matter() RPC flow. So once
 * closed, this renders a "Reopen" trigger instead of a status dropdown,
 * and hands off to the caller's own existing reopen confirmation dialog
 * (matter-detail-page.tsx already has one, with its reason field) rather
 * than reimplementing that here.
 */
export function MatterStatusMenu({
  status,
  onChangeStatus,
  onReopen,
  disabled,
}: {
  status: MatterStatus
  onChangeStatus: (status: MatterStatus) => void
  onReopen: () => void
  disabled?: boolean
}) {
  const meta = MATTER_STATUS_META[status]
  const closed = isMatterClosed(status)

  if (disabled) {
    return <Badge variant={meta.variant}>{meta.label}</Badge>
  }

  if (closed) {
    return (
      <button type="button" onClick={onReopen} className="inline-flex">
        <Badge variant={meta.variant} className="cursor-pointer gap-1 hover:opacity-80">
          {meta.label} <LockOpen className="h-3 w-3" />
        </Badge>
      </button>
    )
  }

  return <StatusBadgeMenu value={status} options={MATTER_STATUSES} meta={MATTER_STATUS_META} onChange={onChangeStatus} />
}
