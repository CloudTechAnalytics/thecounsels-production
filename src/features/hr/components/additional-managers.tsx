import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import type { EmployeeRecord } from '@/features/hr/services/employees.service'
import { supabase } from '@/shared/lib/supabase'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const GONE = ['resigned', 'terminated', 'former_employee']

export function useSetAdditionalManagers() {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ employeeId, managerIds }: { employeeId: string; managerIds: string[] }) => {
      const { error } = await supabase.rpc('set_additional_line_managers', { p_org: activeOrgId!, p_employee: employeeId, p_manager_ids: managerIds })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr'] }),
  })
}

/** "Also reports to": extra line managers besides the primary one. Any of
 * them can approve leave, endorse fund requests and approve item requests.
 * Saves as soon as one is added or removed. */
export function AdditionalManagers({ employee, staff, canEdit, compact }: {
  employee: EmployeeRecord; staff: EmployeeRecord[]; canEdit: boolean; compact?: boolean
}) {
  const save = useSetAdditionalManagers()
  const [adding, setAdding] = React.useState(false)
  const ids = employee.additionalManagerIds ?? []
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.fullName ?? 'Staff member'
  const options = staff.filter((s) => s.id !== employee.id && s.id !== employee.manager_employee_id && !ids.includes(s.id) && !GONE.includes(s.employment_status))

  const update = (next: string[], done: string) =>
    save.mutate({ employeeId: employee.id, managerIds: next }, {
      onSuccess: () => toast.success(done),
      onError: (e) => toast.error('Could not update line managers', { description: errorMessage(e) }),
    })

  if (!canEdit && ids.length === 0) return null
  return (
    <div className={compact ? 'mt-1.5' : 'space-y-1.5'}>
      {!compact && <p className="text-xs font-medium text-muted-foreground">Also reports to</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {compact && ids.length > 0 && <span className="text-xs text-muted-foreground">Also:</span>}
        {ids.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs">
            {nameOf(id)}
            {canEdit && (
              <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" disabled={save.isPending}
                aria-label={`Remove ${nameOf(id)}`} onClick={() => update(ids.filter((x) => x !== id), `${nameOf(id)} removed as a line manager`)}>
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        {canEdit && !employee.reports_to_no_one && (adding ? (
          <Select open onOpenChange={(o) => !o && setAdding(false)} onValueChange={(v) => { setAdding(false); update([...ids, v], `${employee.first_name} now also reports to ${nameOf(v)}`) }}>
            <SelectTrigger className="h-7 w-52 text-xs"><SelectValue placeholder="Choose a line manager" /></SelectTrigger>
            <SelectContent>{options.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}{s.hasLogin ? '' : ' (no login)'}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <button type="button" onClick={() => setAdding(true)} disabled={save.isPending || !employee.manager_employee_id}
            title={!employee.manager_employee_id ? 'Set the main line manager first' : undefined}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-3 w-3" /> {ids.length ? 'Add another' : 'Add another line manager'}
          </button>
        ))}
      </div>
    </div>
  )
}
