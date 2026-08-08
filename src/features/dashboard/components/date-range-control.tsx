import { CalendarRange } from 'lucide-react'
import { DATE_RANGE_PRESETS, type DateRange, type DateRangePreset } from '@/features/dashboard/hooks/use-date-range'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

/**
 * One row, above the charts it scopes — presets before custom range, per the
 * dataviz skill's filter placement guidance. Drives the trend charts and the
 * activity feed only; snapshot KPI tiles (Revenue This Month, Hearings This
 * Week, ...) each have their own fixed period and stay as-is.
 */
export function DateRangeControl({
  range,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}: {
  range: DateRange
  onPresetChange: (preset: DateRangePreset) => void
  onCustomFromChange: (from: string) => void
  onCustomToChange: (to: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
      {DATE_RANGE_PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => onPresetChange(p.key)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            range.preset === p.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPresetChange('custom')}
        className={cn(
          'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
          range.preset === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        Custom
      </button>

      {range.preset === 'custom' && (
        <div className="ml-1 flex items-center gap-1.5 border-l border-border pl-3">
          <Input type="date" value={range.from} onChange={(e) => onCustomFromChange(e.target.value)} className="h-8 w-36 text-xs" aria-label="From date" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={range.to} onChange={(e) => onCustomToChange(e.target.value)} className="h-8 w-36 text-xs" aria-label="To date" />
        </div>
      )}
    </div>
  )
}
