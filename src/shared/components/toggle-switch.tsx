import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

/** Labelled on/off row with a pill switch. Shared by Notification preferences and Settings. */
export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  label,
  hint,
  icon: Icon,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  hint: string
  icon: LucideIcon
}) {
  return (
    <label
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3',
        disabled ? 'opacity-60' : 'cursor-pointer',
      )}
    >
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <span>
          <span className="text-sm font-medium">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}
