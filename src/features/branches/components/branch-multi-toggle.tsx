import { useBranches } from '@/features/branches/hooks/use-branches'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'

/** Multi-select chip toggle — for 'multiple_branches' access scope, where a
 * membership needs 2+ branch assignments. A plain toggle-chip list, not a
 * new checkbox/combobox primitive — matches this codebase's existing
 * minimal-dependency style. */
export function BranchMultiToggle({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string | null
  value: string[]
  onChange: (branchIds: string[]) => void
}) {
  const { data: branches } = useBranches(organizationId)

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  if (!branches || branches.length === 0) {
    return <p className="text-xs text-muted-foreground">No branches yet — add one in the Branches tab first.</p>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {branches
        .filter((b) => b.is_active || value.includes(b.id))
        .map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => toggle(b.id)}
            className={cn('cursor-pointer', value.includes(b.id) ? '' : 'opacity-60 hover:opacity-100')}
          >
            <Badge variant={value.includes(b.id) ? 'default' : 'muted'}>{b.name}</Badge>
          </button>
        ))}
    </div>
  )
}
