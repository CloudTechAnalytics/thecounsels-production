import * as React from 'react'
import { UserPlus, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import {
  useAssignMatterMember,
  useFirmMembers,
  useMatterAssignments,
  useUnassignMatterMember,
} from '@/features/matters/hooks/use-matters'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ConfirmDialog } from '@/shared/components/confirm-dialog'
import { initialsOf } from '@/shared/lib/format'
import { toast } from '@/shared/components/ui/sonner'

/** Everyone with matter_assignments access, beyond the single lead lawyer
 * shown on the Overview tab — the confidentiality boundary this list
 * actually controls (see migration 0030). */
export function MatterTeamCard({ matterId }: { matterId: string }) {
  const { activeOrgId, profile } = useAuth()
  const { has } = usePermissions()
  const canManage = has('matters.assign')

  const { data: assignments, isLoading } = useMatterAssignments(matterId)
  const { data: members } = useFirmMembers(activeOrgId)
  const assign = useAssignMatterMember(activeOrgId, matterId, profile?.id ?? null)
  const unassign = useUnassignMatterMember(matterId)
  const [picked, setPicked] = React.useState('')
  const [toRemove, setToRemove] = React.useState<{ userId: string; name: string } | null>(null)

  const confirmRemove = async () => {
    if (!toRemove) return
    try {
      await unassign.mutateAsync(toRemove.userId)
      setToRemove(null)
    } catch (err) {
      toast.error('Could not remove', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const assignedIds = new Set((assignments ?? []).map((a) => a.user_id))
  const available = (members ?? []).filter((m) => !assignedIds.has(m.user_id))

  const handleAssign = async () => {
    if (!picked) return
    try {
      await assign.mutateAsync(picked)
      setPicked('')
    } catch (err) {
      toast.error('Could not assign', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Assigned team</CardTitle>
        <p className="text-sm text-muted-foreground">Beyond the lead lawyer, who else can access this matter.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : assignments && assignments.length > 0 ? (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                  {initialsOf(a.user?.full_name, 'U')}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{a.user?.full_name ?? 'Unknown'}</span>
                {canManage && (
                  <button
                    aria-label={`Remove ${a.user?.full_name ?? 'member'}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setToRemove({ userId: a.user_id, name: a.user?.full_name ?? 'this member' })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No one else is assigned.</p>
        )}

        {canManage && (
          <div className="flex gap-2 border-t border-border pt-3">
            <Select value={picked} onValueChange={setPicked}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Add a team member…" /></SelectTrigger>
              <SelectContent>
                {available.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" disabled={!picked || assign.isPending} onClick={handleAssign} aria-label="Assign">
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(toRemove)}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Remove from matter"
        destructive
        confirmLabel="Remove"
        loading={unassign.isPending}
        description={<>This removes <strong>{toRemove?.name}</strong>'s access to this matter.</>}
        onConfirm={confirmRemove}
      />
    </Card>
  )
}
