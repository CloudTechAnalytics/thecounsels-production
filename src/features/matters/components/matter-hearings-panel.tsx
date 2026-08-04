import * as React from 'react'
import { Plus, Gavel } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useHearings, useDeleteHearing } from '@/features/hearings/hooks/use-hearings'
import { HearingFormDialog } from '@/features/hearings/components/hearing-form-dialog'
import { HearingCard } from '@/features/hearings/components/hearing-card'
import type { HearingRow } from '@/features/hearings/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { toast } from '@/shared/components/ui/sonner'

export function MatterHearingsPanel({ matterId }: { matterId: string }) {
  const { activeOrgId } = useAuth()
  const { has } = usePermissions()
  const { data, isLoading } = useHearings(activeOrgId, { matterId })
  const del = useDeleteHearing(activeOrgId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<HearingRow | null>(null)
  const [toDelete, setToDelete] = React.useState<HearingRow | null>(null)

  const canCreate = has('hearings.create')
  const canEdit = has('hearings.update')
  const canDelete = has('hearings.delete')

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (h: HearingRow) => { setEditing(h); setFormOpen(true) }

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={openNew}><Plus /> Schedule hearing</Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((h) => (
            <HearingCard
              key={h.id}
              h={h}
              showMatter={false}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => openEdit(h)}
              onDelete={() => setToDelete(h)}
            />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Gavel className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold">No hearings scheduled for this matter yet.</p>
          {canCreate && <Button onClick={openNew} size="sm" className="mt-1"><Plus /> Schedule hearing</Button>}
        </Card>
      )}

      <HearingFormDialog hearing={editing} presetMatterId={matterId} open={formOpen} onOpenChange={setFormOpen} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete hearing"
        destructive
        confirmLabel="Delete"
        loading={del.isPending}
        description={<>This removes <strong>{toDelete?.title}</strong> from the calendar.</>}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await del.mutateAsync({ id: toDelete.id, title: toDelete.title })
            toast.success('Hearing deleted')
            setToDelete(null)
          } catch (err) {
            toast.error('Could not delete', { description: err instanceof Error ? err.message : undefined })
          }
        }}
      />
    </div>
  )
}
