import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import type { DateRange } from '@/features/dashboard/hooks/use-date-range'

export type ActivityCategory =
  | 'matter.created'
  | 'matter.updated'
  | 'client.created'
  | 'hearing.scheduled'
  | 'document.uploaded'
  | 'note.added'
  | 'task.completed'
  | 'invoice.sent'
  | 'payment.recorded'

export const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  'matter.created': 'Matters Created',
  'matter.updated': 'Matters Updated',
  'client.created': 'Clients Created',
  'hearing.scheduled': 'Hearings Scheduled',
  'document.uploaded': 'Documents Uploaded',
  'note.added': 'Notes Added',
  'task.completed': 'Tasks Completed',
  'invoice.sent': 'Invoices Sent',
  'payment.recorded': 'Payments Recorded',
}

const TRACKED_ACTIONS = Object.keys(ACTIVITY_CATEGORY_LABEL) as ActivityCategory[]

export interface ActivityBreakdownEntry {
  key: ActivityCategory
  label: string
  count: number
}

export interface ActivityDay {
  date: string
  label: string
  total: number
  breakdown: ActivityBreakdownEntry[]
}

export interface FirmActivityTrend {
  days: ActivityDay[]
  totalInRange: number
}

function dayLabel(d: Date): string {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(d)
}

/**
 * Daily firm activity, broken down by category, for the Managing Partner
 * dashboard chart. One query against audit_logs (already the firm's action
 * log — see matters/tasks services for the two categories that needed a new
 * log_audit call to appear here). Bucketed and labeled client-side; the
 * chart itself plots only the daily total, one line — the breakdown lives in
 * its tooltip.
 */
export function useFirmActivityTrend(organizationId: string | null, range: DateRange) {
  return useQuery({
    queryKey: ['dashboard', 'firm-activity-trend', organizationId, range.from, range.to],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<FirmActivityTrend> => {
      const fromDate = new Date(`${range.from}T00:00:00`)
      const toDate = new Date(`${range.to}T23:59:59.999`)

      const { data, error } = await supabase
        .from('audit_logs')
        .select('action, created_at')
        .eq('organization_id', organizationId!)
        .eq('is_platform_action', false)
        .in('action', TRACKED_ACTIONS)
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString())
      if (error) throw error

      const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
      const days: ActivityDay[] = Array.from({ length: dayCount }, (_, i) => {
        const d = new Date(fromDate)
        d.setDate(fromDate.getDate() + i)
        return {
          date: d.toISOString().slice(0, 10),
          label: dayLabel(d),
          total: 0,
          breakdown: TRACKED_ACTIONS.map((key) => ({ key, label: ACTIVITY_CATEGORY_LABEL[key], count: 0 })),
        }
      })
      const indexByDate = new Map(days.map((d, i) => [d.date, i]))

      for (const row of data ?? []) {
        const dateKey = row.created_at.slice(0, 10)
        const idx = indexByDate.get(dateKey)
        if (idx == null) continue
        const entry = days[idx].breakdown.find((b) => b.key === (row.action as ActivityCategory))
        if (!entry) continue
        entry.count += 1
        days[idx].total += 1
      }

      for (const day of days) {
        day.breakdown = day.breakdown.filter((b) => b.count > 0)
      }

      return { days, totalInRange: (data ?? []).length }
    },
  })
}
