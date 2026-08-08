import * as React from 'react'

export type DateRangePreset = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom'

export interface DateRange {
  preset: DateRangePreset
  /** ISO date (yyyy-mm-dd), inclusive. */
  from: string
  /** ISO date (yyyy-mm-dd), inclusive. */
  to: string
}

export const DATE_RANGE_PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'year', label: 'This year' },
]

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function resolvePreset(preset: DateRangePreset): { from: string; to: string } {
  const today = new Date()
  const to = toISODate(today)
  if (preset === 'today') return { from: to, to }
  if (preset === 'year') return { from: `${today.getFullYear()}-01-01`, to }
  const days = preset === '7d' ? 6 : preset === '30d' ? 29 : 89 // inclusive of today
  const from = new Date(today)
  from.setDate(today.getDate() - days)
  return { from: toISODate(from), to }
}

/** Dashboard date-range state — drives the trend charts and the activity feed only (see dashboard-page.tsx). */
export function useDateRange(initial: DateRangePreset = '30d') {
  const [preset, setPreset] = React.useState<DateRangePreset>(initial)
  const [custom, setCustom] = React.useState(() => resolvePreset(initial))

  const range = React.useMemo<DateRange>(() => {
    if (preset === 'custom') return { preset, ...custom }
    return { preset, ...resolvePreset(preset) }
  }, [preset, custom])

  return {
    range,
    setPreset,
    setCustomFrom: (from: string) => setCustom((c) => ({ ...c, from })),
    setCustomTo: (to: string) => setCustom((c) => ({ ...c, to })),
  }
}
