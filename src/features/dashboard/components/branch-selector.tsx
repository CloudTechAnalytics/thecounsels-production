import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'

const ALL = '__all__'

/** "All Branches / Lagos / Abuja / Kano" — only rendered by the caller when
 * useBranchScope().canSelect is true (a user with access to exactly one
 * branch has nothing to switch between). */
export function BranchSelector({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[]
  value: string
  onChange: (branchId: string) => void
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All Branches</SelectItem>
        {options.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
