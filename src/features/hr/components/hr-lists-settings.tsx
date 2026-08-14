import * as React from 'react'
import { Plus, X } from 'lucide-react'
import {
  useDepartments, useCreateDepartment, useDeleteDepartment,
  useJobTitles, useCreateJobTitle, useDeleteJobTitle,
  useLeaveTypes, useCreateLeaveType,
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

/** Departments, job titles and leave types are all org-configurable —
 * seeded with sensible defaults (0084) but never fixed. This is the only
 * place to add/remove them, so HR isn't stuck with only what shipped. */
export function HrListsSettings() {
  const { activeOrgId } = useAuth()
  const { data: departments } = useDepartments(activeOrgId)
  const createDept = useCreateDepartment(activeOrgId)
  const deleteDept = useDeleteDepartment(activeOrgId)
  const { data: jobTitles } = useJobTitles(activeOrgId)
  const createTitle = useCreateJobTitle(activeOrgId)
  const deleteTitle = useDeleteJobTitle(activeOrgId)
  const { data: leaveTypes } = useLeaveTypes(activeOrgId)
  const createLeaveType = useCreateLeaveType(activeOrgId)

  return (
    <div className="grid gap-4 sm:grid-cols-3">
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
      <SimpleListCard
        title="Leave types"
        items={leaveTypes}
        adding={createLeaveType.isPending}
        onAdd={(name) => createLeaveType.mutateAsync({ name, days: 10 })}
      />
    </div>
  )
}
