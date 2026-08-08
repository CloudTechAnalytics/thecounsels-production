import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { DateRange } from '@/features/dashboard/hooks/use-date-range'

export interface BillableHoursDay {
  date: string
  label: string
  hours: number
  matters: string[]
}

export interface BillableHoursTrend {
  days: BillableHoursDay[]
  totalHours: number
}

function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(d)
}

/** The signed-in user's own daily billable hours — the Senior Associate dashboard chart. */
export function useBillableHoursTrend(organizationId: string | null, userId: string | null, range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'billable-hours-trend', organizationId, userId, range.from, range.to],
    enabled: Boolean(organizationId && userId),
    queryFn: async (): Promise<BillableHoursTrend> => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('work_date, minutes, matter:matters(title)')
        .eq('organization_id', organizationId!)
        .eq('user_id', userId!)
        .eq('billable', true)
        .gte('work_date', range.from)
        .lte('work_date', range.to)
      if (error) throw error

      const fromDate = new Date(`${range.from}T00:00:00`)
      const toDate = new Date(`${range.to}T00:00:00`)
      const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
      const days: BillableHoursDay[] = Array.from({ length: dayCount }, (_, i) => {
        const d = new Date(fromDate)
        d.setDate(fromDate.getDate() + i)
        return { date: d.toISOString().slice(0, 10), label: dayLabel(d), hours: 0, matters: [] }
      })
      const indexByDate = new Map(days.map((d, i) => [d.date, i]))

      let totalMinutes = 0
      for (const row of (data ?? []) as unknown as { work_date: string; minutes: number; matter: { title: string } | null }[]) {
        const idx = indexByDate.get(row.work_date)
        if (idx == null) continue
        days[idx].hours += row.minutes
        totalMinutes += row.minutes
        const title = row.matter?.title
        if (title && !days[idx].matters.includes(title)) days[idx].matters.push(title)
      }
      for (const day of days) day.hours = Math.round((day.hours / 60) * 10) / 10

      return { days, totalHours: Math.round((totalMinutes / 60) * 10) / 10 }
    },
  })
}
