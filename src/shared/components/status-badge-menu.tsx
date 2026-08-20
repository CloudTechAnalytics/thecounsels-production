import { ChevronDown } from 'lucide-react'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'

/**
 * A status badge that's also the quick-change control — click it, pick a
 * new status, done. No edit form needed for the common case. Reused across
 * tasks, hearings, and matters (matters only for the non-terminal states —
 * see matter-status-menu.tsx for why closed/won/lost needs its own
 * Reopen-flow branch instead of this).
 */
export function StatusBadgeMenu<T extends string>({
  value,
  options,
  meta,
  onChange,
  disabled,
}: {
  value: T
  options: T[]
  meta: Record<T, { label: string; variant: BadgeProps['variant'] }>
  onChange: (next: T) => void
  disabled?: boolean
}) {
  if (disabled) {
    return <Badge variant={meta[value].variant}>{meta[value].label}</Badge>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={(e) => e.stopPropagation()} className="inline-flex">
          <Badge variant={meta[value].variant} className="cursor-pointer gap-0.5 pr-1.5 hover:opacity-80">
            {meta[value].label} <ChevronDown className="h-3 w-3" />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {options.map((opt) => (
          <DropdownMenuItem key={opt} disabled={opt === value} onClick={() => onChange(opt)}>
            {meta[opt].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
