import * as React from 'react'
import { Plus, X } from 'lucide-react'
import {
  useDepartments, useCreateDepartment, useDeleteDepartment,
  useJobTitles, useCreateJobTitle, useDeleteJobTitle,
  useLeaveTypes, useCreateLeaveType, useUpdateLeaveTypeLimit,
} from '@/features/hr/hooks/use-hr'
import { useAuth } from '@/features/auth/context/auth-provider'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

function SimpleListCard({
  title, items, onAdd, onDelete, adding,
}: {
  title: string
  items: { id: string; name: string }[] | undefined
  onAdd: (name: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  adding: boolean
}) {
  const [value, setValue] = React.useState('')

  const add = async () => {
    if (!value.trim()) return
    try {
      await onAdd(value.trim())
      setValue('')
    } catch (err) {
      toast.error('Could not add', { description: errorMessage(err) })
    }
  }

  return (
    <Card className="p-5">
      <p className="font-display text-sm font-semibold">{title}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {items && items.length > 0 ? (
          items.map((i) => (
            <Badge key={i.id} variant="outline" className="gap-1 pr-1">
              {i.name}
              {onDelete && (
                <button
                  onClick={async () => {
                    try { await onDelete(i.id) } catch (err) { toast.error('Could not remove', { description: errorMessage(err) }) }
                  }}
                  aria-label={`Remove ${i.name}`}
                  className="rounded-full p-0.5 hover:bg-destructive/15 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">None yet.</p>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add new…" className="h-8" onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button size="sm" variant="outline" loading={adding} onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
    </Card>
  )
}

/** Leave types get their own card, not the generic list — the entitlement
 * (Limit) is set to 0 by default (0085 — never assumed on your behalf) and
 * is the one thing here that actually needs editing per type, not just
 * adding/removing. */
function LeaveTypesCard() {
  const { activeOrgId } = useAuth()
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const create = useCreateLeaveType(activeOrgId)
  const updateLimit = useUpdateLeaveTypeLimit(activeOrgId)
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [newName, setNewName] = React.useState('')
  const [newDays, setNewDays] = React.useState('')

  const saveLimit = async (id: string, current: number) => {
    const raw = drafts[id]
    if (raw === undefined) return
    const days = Number(raw)
    if (!Number.isFinite(days) || days < 0 || days === current) return
    try {
      await updateLimit.mutateAsync({ id, days })
    } catch (err) {
      toast.error('Could not update limit', { description: errorMessage(err) })
    }
  }

  const addType = async () => {
    if (!newName.trim()) return
    try {
      await create.mutateAsync({ name: newName.trim(), days: Number(newDays) || 0 })
      setNewName(''); setNewDays('')
    } catch (err) {
      toast.error('Could not add', { description: errorMessage(err) })
    }
  }

  return (
    <Card className="p-5">
      <p className="font-display text-sm font-semibold">Leave types</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Limit is days per year — set to 0 until you decide otherwise, nothing assumed.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium">Leave type</th>
              <th className="w-24 pb-2 font-medium">Limit</th>
            </tr>
          </thead>
          <tbody>
            {leaveTypes?.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="py-1.5 pr-2">{t.name}</td>
                <td className="py-1.5">
                  <Input
                    type="number"
                    min={0}
                    className="h-7 w-20"
                    value={drafts[t.id] ?? String(t.default_entitlement_days)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    onBlur={() => saveLimit(t.id, t.default_entitlement_days)}
                    onKeyDown={(e) => e.key === 'Enter' && saveLimit(t.id, t.default_entitlement_days)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New leave type…" className="h-8" />
        <Input type="number" min={0} value={newDays} onChange={(e) => setNewDays(e.target.value)} placeholder="Limit" className="h-8 w-20" />
        <Button size="sm" variant="outline" loading={create.isPending} onClick={addType}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
    </Card>
  )
}

/** Departments and job titles are simple add/remove lists; leave types
 * need their own editable-limit card above. Seeded with sensible names
 * (0084/0085) but never fixed — this is the only place to change any of
 * them, so HR isn't stuck with only what shipped. */
export function HrListsSettings() {
  const { activeOrgId } = useAuth()
  const { data: departments } = useDepartments(activeOrgId)
  const createDept = useCreateDepartment(activeOrgId)
  const deleteDept = useDeleteDepartment(activeOrgId)
  const { data: jobTitles } = useJobTitles(activeOrgId)
  const createTitle = useCreateJobTitle(activeOrgId)
  const deleteTitle = useDeleteJobTitle(activeOrgId)

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <SimpleListCard
        title="Departments"
        items={departments}
        adding={createDept.isPending}
        onAdd={(name) => createDept.mutateAsync(name)}
        onDelete={(id) => deleteDept.mutateAsync(id)}
      />
      <SimpleListCard
        title="Job titles"
        items={jobTitles}
        adding={createTitle.isPending}
        onAdd={(name) => createTitle.mutateAsync(name)}
        onDelete={(id) => deleteTitle.mutateAsync(id)}
      />
      <LeaveTypesCard />
    </div>
  )
}
