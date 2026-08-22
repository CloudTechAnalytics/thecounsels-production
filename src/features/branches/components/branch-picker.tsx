import { useBranches } from '@/features/branches/hooks/use-branches'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'

const NONE = '__none__'
const ALL = '__all__'

/** Single-branch picker — used in matter/task/hearing/appointment forms
 * (with a "No branch" option) and list-page filters (with an "All
 * branches" option) via the `mode` prop. */
export function BranchPicker({
  organizationId,
  value,
  onChange,
  mode = 'form',
  placeholder,
}: {
  organizationId: string | null
  value: string
  onChange: (value: string) => void
  mode?: 'form' | 'filter'
  placeholder?: string
}) {
  const { data: branches } = useBranches(organizationId)
  const emptyValue = mode === 'filter' ? ALL : NONE
  const emptyLabel = mode === 'filter' ? 'All branches' : 'No branch'

  return (
    <Select value={value || emptyValue} onValueChange={(v) => onChange(v === emptyValue ? '' : v)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={emptyValue}>{emptyLabel}</SelectItem>
        {(branches ?? [])
          .filter((b) => b.is_active || b.id === value)
          .map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
              {b.is_head_office ? ' (Head Office)' : ''}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}
