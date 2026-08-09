import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays, format } from 'date-fns'
import { supabase } from '@/shared/lib/supabase'
import { reportsService } from '@/features/reports/services/reports.service'
import { timeAmount } from '@/features/billing/types'
import { formatMoneyCompact } from '@/shared/lib/format'

export type InsightSeverity = 'alert' | 'warning' | 'suggestion' | 'positive'

export interface FirmInsight {
  id: string
  severity: InsightSeverity
  title: string
  detail?: string
  /** In-app route the insight points at. */
  to: string
}

const SEVERITY_ORDER: InsightSeverity[] = ['alert', 'warning', 'suggestion', 'positive']

/**
 * Rule-based insights computed from the firm's own live data: deadline risk,
 * collections, unbilled work and workload balance. Financial rules (invoices,
 * WIP, collection rate) only run for `reports.financial` holders.
 */
export function useFirmInsights(organizationId: string | null, includeFinancial = true) {
  return useQuery({
    queryKey: ['dashboard', 'insights', organizationId, includeFinancial],
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<FirmInsight[]> => {
      const nowIso = new Date().toISOString()
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const [report, hearingsRes, docsTodayRes] = await Promise.all([
        reportsService.getReportData(organizationId!),
        supabase
          .from('hearings')
          .select('id, title, hearing_at, matter_id, status')
          .eq('organization_id', organizationId!)
          .neq('status', 'cancelled')
          .gte('hearing_at', nowIso)
          .order('hearing_at', { ascending: true }),
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId!)
          .gte('created_at', todayStart.toISOString()),
      ])
      if (hearingsRes.error) throw hearingsRes.error
      if (docsTodayRes.error) throw docsTodayRes.error
      const hearings = hearingsRes.data ?? []

      const insights: FirmInsight[] = []
      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)

      // 1. Imminent hearings (next 72 hours).
      for (const h of hearings.slice(0, 10)) {
        const at = new Date(h.hearing_at)
        const hoursAway = (at.getTime() - now.getTime()) / 3_600_000
        if (hoursAway <= 72 && insights.filter((i) => i.id.startsWith('hearing-')).length < 2) {
          const days = differenceInCalendarDays(at, now)
          const when = days === 0 ? `today at ${format(at, 'HH:mm')}` : days === 1 ? `tomorrow at ${format(at, 'HH:mm')}` : `in ${days} days`
          insights.push({
            id: `hearing-${h.id}`,
            severity: 'alert',
            title: `Hearing ${when}`,
            detail: h.title,
            to: '/hearings',
          })
        }
      }

      // 2. Overdue, unpaid invoices.
      const overdueInvoices = report.invoices.filter(
        (i) => i.status === 'sent' && i.due_date && i.due_date < todayStr && i.amount_paid < i.total,
      )
      if (includeFinancial && overdueInvoices.length > 0) {
        const amount = overdueInvoices.reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0)
        insights.push({
          id: 'overdue-invoices',
          severity: 'alert',
          title: `${formatMoneyCompact(amount)} overdue`,
          detail: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? '' : 's'} past due — chase collections`,
          to: '/billing',
        })
      }

      // 3. Overdue tasks.
      const overdueTasks = report.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && t.due_date && t.due_date < todayStr)
      if (overdueTasks.length > 0) {
        insights.push({
          id: 'overdue-tasks',
          severity: 'warning',
          title: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`,
          detail: 'Deadlines have passed without completion',
          to: '/tasks',
        })
      }

      // 4. Matters in court with no upcoming hearing on the calendar.
      const withUpcoming = new Set(hearings.map((h) => h.matter_id).filter(Boolean))
      const inCourtNoHearing = report.matters.filter((m) => m.status === 'in_court' && !withUpcoming.has(m.id))
      if (inCourtNoHearing.length > 0) {
        insights.push({
          id: 'in-court-no-hearing',
          severity: 'warning',
          title: `${inCourtNoHearing.length} matter${inCourtNoHearing.length === 1 ? '' : 's'} in court with no hearing scheduled`,
          detail: inCourtNoHearing[0].title + (inCourtNoHearing.length > 1 ? ' and others' : ''),
          to: '/matters',
        })
      }

      // 5. Unbilled work piling up.
      const wip =
        report.timeEntries.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + timeAmount(t.minutes, Number(t.rate)), 0) +
        report.expenses.filter((e) => e.billable && !e.invoiced).reduce((s, e) => s + Number(e.amount), 0)
      if (includeFinancial && wip > 0) {
        insights.push({
          id: 'unbilled-wip',
          severity: 'suggestion',
          title: `${formatMoneyCompact(wip)} of unbilled work`,
          detail: 'Billable time and expenses not yet invoiced',
          to: '/billing',
        })
      }

      // 6. Workload imbalance across lead lawyers.
      const activeByLead = new Map<string, number>()
      for (const m of report.matters) {
        if (!['open', 'pending', 'in_court'].includes(m.status) || !m.lead_lawyer_id) continue
        activeByLead.set(m.lead_lawyer_id, (activeByLead.get(m.lead_lawyer_id) ?? 0) + 1)
      }
      if (activeByLead.size > 1) {
        const entries = [...activeByLead.entries()].sort((a, b) => b[1] - a[1])
        const [topId, topCount] = entries[0]
        const minCount = entries[entries.length - 1][1]
        if (topCount - minCount >= 3) {
          const name = report.members.find((m) => m.profile?.id === topId)?.profile?.full_name ?? 'One lawyer'
          insights.push({
            id: 'workload',
            severity: 'suggestion',
            title: 'Workload is unbalanced',
            detail: `${name} leads ${topCount} active matters — others carry ${minCount}`,
            to: '/staff',
          })
        }
      }

      // 7. Collection rate (only meaningful once real invoicing exists).
      const invoiced = report.invoices.filter((i) => i.status !== 'void' && i.status !== 'draft')
      const invoicedTotal = invoiced.reduce((s, i) => s + Number(i.total), 0)
      const collectedTotal = invoiced.reduce((s, i) => s + Number(i.amount_paid), 0)
      if (includeFinancial && invoicedTotal > 0 && invoiced.length >= 3 && collectedTotal / invoicedTotal < 0.5) {
        insights.push({
          id: 'collection-rate',
          severity: 'warning',
          title: `Collection rate is ${Math.round((collectedTotal / invoicedTotal) * 100)}%`,
          detail: 'Less than half of invoiced value has been collected',
          to: '/reports',
        })
      }

      // 8. Invoices awaiting payment — sent/partial, not yet overdue (rule 2 above already covers overdue ones).
      const awaitingPayment = report.invoices.filter(
        (i) =>
          (i.status === 'sent' || i.status === 'partial') &&
          i.amount_paid < i.total &&
          !(i.status === 'sent' && i.due_date && i.due_date < todayStr),
      )
      if (includeFinancial && awaitingPayment.length > 0) {
        insights.push({
          id: 'awaiting-payment',
          severity: 'suggestion',
          title: `${awaitingPayment.length} invoice${awaitingPayment.length === 1 ? '' : 's'} awaiting payment`,
          detail: 'Sent, not yet past due',
          to: '/billing',
        })
      }

      // 9. A matter that's gone quiet — no logged activity (or none since opening) in 15+ days.
      const activeMatterIds = report.matters.filter((m) => ['open', 'pending', 'in_court'].includes(m.status)).map((m) => m.id)
      if (activeMatterIds.length > 0) {
        const { data: events, error: eventsErr } = await supabase
          .from('matter_events')
          .select('matter_id, created_at')
          .in('matter_id', activeMatterIds)
          .order('created_at', { ascending: false })
        if (eventsErr) throw eventsErr
        const lastActivity = new Map<string, string>()
        for (const e of events ?? []) {
          if (!lastActivity.has(e.matter_id)) lastActivity.set(e.matter_id, e.created_at)
        }
        let stalest: { matter: (typeof report.matters)[number]; days: number } | null = null
        for (const m of report.matters) {
          if (!activeMatterIds.includes(m.id)) continue
          const last = lastActivity.get(m.id) ?? m.opened_on
          const days = differenceInCalendarDays(now, new Date(last))
          if (days >= 15 && (!stalest || days > stalest.days)) stalest = { matter: m, days }
        }
        if (stalest) {
          insights.push({
            id: 'stale-matter',
            severity: 'warning',
            title: `Matter ${stalest.matter.matter_number ?? stalest.matter.title} has had no activity for ${stalest.days} days`,
            detail: stalest.matter.title,
            to: `/matters/${stalest.matter.id}`,
          })
        }
      }

      // 10. Documents uploaded today — a positive, informational signal.
      const docsToday = docsTodayRes.count ?? 0
      if (docsToday > 0) {
        insights.push({
          id: 'docs-today',
          severity: 'positive',
          title: `${docsToday} document${docsToday === 1 ? '' : 's'} uploaded today`,
          to: '/documents',
        })
      }

      insights.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))

      if (insights.length === 0) {
        insights.push({
          id: 'all-clear',
          severity: 'positive',
          title: 'All clear.',
          detail: 'No urgent issues detected.',
          to: '/reports',
        })
      }

      return insights.slice(0, 5)
    },
  })
}
