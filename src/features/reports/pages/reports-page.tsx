import * as React from 'react'
import {
  Banknote, CircleDollarSign, AlertTriangle, Percent, Briefcase, Users,
  Clock, FileDown, RotateCcw, CalendarRange, ListChecks,
} from 'lucide-react'
import { format, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { printFirmReport } from '@/features/reports/lib/print-report'
import { Button } from '@/shared/components/ui/button'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useReportData, useReportKpis } from '@/features/reports/hooks/use-reports'
import type { ReportData, ReportFilters } from '@/features/reports/services/reports.service'
import { useFirmMembers } from '@/features/matters/hooks/use-matters'
import { useClients } from '@/features/clients/hooks/use-clients'
import { PRACTICE_AREAS } from '@/features/matters/types'
import { StatTile } from '@/features/dashboard/components/stat-tile'
import { PageHeader } from '@/shared/components/page-header'
import { ExportButton } from '@/shared/components/export-button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { BarChart, DistributionBars } from '@/shared/components/bar-chart'
import { formatNaira, formatMoneyCompact, titleCase, initialsOf } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const ACTIVE = ['open', 'pending', 'in_court', 'under_review']
const timeAmt = (min: number, rate: number) => (min / 60) * rate
const monthLabel = new Intl.DateTimeFormat('en', { month: 'short' })

function useComputed(data: ReportData | undefined) {
  return React.useMemo(() => {
    if (!data) return null
    const { invoices, timeEntries, expenses, matters, tasks, clients, members } = data
    const clientName = new Map(clients.map((c) => [c.id, c.display_name]))
    const memberName = new Map(members.map((m) => [m.user_id, m.profile?.full_name ?? m.profile?.email ?? '—']))
    const matterInfo = new Map(matters.map((m) => [m.id, m]))
    const billed = invoices.filter((i) => i.status !== 'void' && i.status !== 'draft')

    // Financial
    const invoiced = billed.reduce((s, i) => s + Number(i.total), 0)
    const collected = billed.reduce((s, i) => s + Number(i.amount_paid), 0)
    const outstanding = invoiced - collected
    const collectionRate = invoiced > 0 ? Math.round((collected / invoiced) * 100) : 0

    const start = new Date()
    start.setDate(1); start.setHours(0, 0, 0, 0); start.setMonth(start.getMonth() - 5)
    const byMonth = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start); d.setMonth(start.getMonth() + i)
      return { label: monthLabel.format(d), value: 0 }
    })
    for (const i of billed) {
      const d = new Date(i.issue_date)
      const idx = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth()
      if (idx >= 0 && idx < 6) byMonth[idx].value += Number(i.total)
    }

    const aging = [
      { label: 'Current', value: 0 },
      { label: '1–30 days', value: 0 },
      { label: '31–60 days', value: 0 },
      { label: '60+ days', value: 0 },
    ]
    for (const i of billed) {
      const bal = Number(i.total) - Number(i.amount_paid)
      if (bal <= 0) continue
      const ref = new Date((i.due_date ?? i.issue_date) + 'T00:00:00')
      const age = Math.floor((Date.now() - ref.getTime()) / 86400000)
      const b = age <= 0 ? 0 : age <= 30 ? 1 : age <= 60 ? 2 : 3
      aging[b].value += bal
    }

    const clientAgg = new Map<string, { invoiced: number; outstanding: number }>()
    for (const i of billed) {
      const k = i.client_id ?? 'none'
      const e = clientAgg.get(k) ?? { invoiced: 0, outstanding: 0 }
      e.invoiced += Number(i.total)
      e.outstanding += Number(i.total) - Number(i.amount_paid)
      clientAgg.set(k, e)
    }
    const topClients = [...clientAgg.entries()]
      .map(([id, v]) => ({ id, name: clientName.get(id) ?? 'Unknown', ...v }))
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 8)

    // Productivity
    const productivity = members
      .map((m) => {
        const uid = m.user_id
        const mine = timeEntries.filter((t) => t.user_id === uid)
        const billableMin = mine.filter((t) => t.billable).reduce((s, t) => s + t.minutes, 0)
        const billableValue = mine.filter((t) => t.billable).reduce((s, t) => s + timeAmt(t.minutes, Number(t.rate)), 0)
        const mattersLed = matters.filter((x) => x.lead_lawyer_id === uid && ACTIVE.includes(x.status)).length
        const tasksDone = tasks.filter((x) => x.assignee_id === uid && x.status === 'done').length
        return { id: m.id, userId: uid, name: memberName.get(uid) ?? '—', role: m.role?.name ?? '', billableHours: billableMin / 60, billableValue, mattersLed, tasksDone }
      })
      .sort((a, b) => b.billableValue - a.billableValue)
    const hoursChart = productivity.filter((p) => p.billableHours > 0).slice(0, 8).map((p) => ({ label: p.name.split(' ')[0], value: Math.round(p.billableHours) }))

    // Matters
    const statusCounts = new Map<string, number>()
    const areaCounts = new Map<string, number>()
    for (const m of matters) {
      statusCounts.set(m.status, (statusCounts.get(m.status) ?? 0) + 1)
      const a = m.practice_area ?? 'Unassigned'
      areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1)
    }
    const byStatus = [...statusCounts.entries()].map(([k, v]) => ({ label: titleCase(k), value: v }))
    const byArea = [...areaCounts.entries()].map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value)

    const wipMap = new Map<string, number>()
    for (const t of timeEntries) if (t.billable && !t.invoiced && t.matter_id) wipMap.set(t.matter_id, (wipMap.get(t.matter_id) ?? 0) + timeAmt(t.minutes, Number(t.rate)))
    for (const e of expenses) if (e.billable && !e.invoiced && e.matter_id) wipMap.set(e.matter_id, (wipMap.get(e.matter_id) ?? 0) + Number(e.amount))
    const wipTop = [...wipMap.entries()]
      .map(([id, value]) => ({ id, value, matter: matterInfo.get(id) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    // Clients
    const clientRows = clients
      .map((c) => {
        const agg = clientAgg.get(c.id)
        return {
          id: c.id,
          name: c.display_name,
          type: c.type,
          matters: matters.filter((m) => m.client_id === c.id).length,
          invoiced: agg?.invoiced ?? 0,
          outstanding: agg?.outstanding ?? 0,
        }
      })
      .sort((a, b) => b.invoiced - a.invoiced)
    const individuals = clients.filter((c) => c.type === 'individual').length
    const corporate = clients.filter((c) => c.type === 'corporate').length

    return {
      financial: { invoiced, collected, outstanding, collectionRate, byMonth, aging, topClients },
      productivity, hoursChart,
      matters: { byStatus, byArea, wipTop, total: matters.length, open: matters.filter((m) => ACTIVE.includes(m.status)).length },
      clients: { rows: clientRows, individuals, corporate },
    }
  }, [data])
}

const TABS = ['Financial', 'Productivity', 'Matters', 'Clients'] as const
type Tab = (typeof TABS)[number]
const ALL = 'all'

const PERIODS = [
  { key: 'month', label: 'This month', range: () => ({ from: startOfMonth(new Date()) }) },
  { key: 'quarter', label: 'Last 3 months', range: () => ({ from: startOfMonth(subMonths(new Date(), 2)) }) },
  { key: 'year', label: 'This year', range: () => ({ from: startOfYear(new Date()) }) },
  { key: 'all', label: 'All time', range: () => ({ from: null as Date | null }) },
] as const
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/** Human description of the period, for the screen and the PDF cover. */
function periodLabel(f: ReportFilters): string {
  const fmt = (v: string) => format(new Date(v + 'T00:00:00'), 'd MMM yyyy')
  if (f.dateFrom && f.dateTo) return `${fmt(f.dateFrom)} – ${fmt(f.dateTo)}`
  if (f.dateFrom) return `${fmt(f.dateFrom)} – ${format(new Date(), 'd MMM yyyy')}`
  if (f.dateTo) return `Up to ${fmt(f.dateTo)}`
  return `All time to ${format(new Date(), 'd MMM yyyy')}`
}

function FiltersBar({ filters, set, reset }: { filters: ReportFilters; set: <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => void; reset: () => void }) {
  const { activeOrgId } = useAuth()
  const { data: members } = useFirmMembers(activeOrgId)
  const { data: clients } = useClients(activeOrgId, {})
  const today = iso(new Date())
  const activePreset = PERIODS.find((p) => {
    const r = p.range()
    return (r.from ? iso(r.from) : undefined) === filters.dateFrom && !filters.dateTo
  })?.key
  const dirty = Boolean(filters.dateFrom || filters.dateTo || (filters.lawyerId && filters.lawyerId !== ALL) || (filters.clientId && filters.clientId !== ALL) || (filters.practiceArea && filters.practiceArea !== ALL))

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarRange className="mr-1 h-4 w-4 text-muted-foreground" />
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => { const r = p.range(); set('dateFrom', r.from ? iso(r.from) : undefined); set('dateTo', undefined) }}
              className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors', activePreset === p.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">· {periodLabel(filters)}</span>
        </div>
        {dirty && <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">From</span>
          <Input type="date" max={today} value={filters.dateFrom ?? ''} onChange={(e) => set('dateFrom', e.target.value || undefined)} className="w-full min-w-0" aria-label="From date" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">To</span>
          <Input type="date" value={filters.dateTo ?? ''} onChange={(e) => set('dateTo', e.target.value || undefined)} className="w-full min-w-0" aria-label="To date" />
        </div>
        <Select value={filters.lawyerId ?? ALL} onValueChange={(v) => set('lawyerId', v)}>
          <SelectTrigger><SelectValue placeholder="All lawyers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All lawyers</SelectItem>
            {members?.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.clientId ?? ALL} onValueChange={(v) => set('clientId', v)}>
          <SelectTrigger><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clients?.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.practiceArea ?? ALL} onValueChange={(v) => set('practiceArea', v)}>
          <SelectTrigger><SelectValue placeholder="All practice areas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All practice areas</SelectItem>
            {PRACTICE_AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </Card>
  )
}

/** Lower-priority figures in one compact strip under the headline tiles. */
function Strip({ items, loading }: { items: { label: string; value: string }[]; loading: boolean }) {
  return (
    <Card className="mb-6">
      <dl className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        {items.map((i) => (
          <div key={i.label} className="px-4 py-3">
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">{loading ? <Skeleton className="h-6 w-12" /> : i.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export function ReportsPage() {
  const { activeOrgId, activeMembership, profile } = useAuth()
  const { has } = usePermissions()
  const { data: filterMembers } = useFirmMembers(activeOrgId)
  const { data: filterClients } = useClients(activeOrgId, {})
  const canFinancials = has('reports.financial')
  const visibleTabs = canFinancials ? TABS : TABS.filter((t) => t !== 'Financial')

  const [filters, setFilters] = React.useState<ReportFilters>(() => ({ dateFrom: iso(startOfYear(new Date())) }))
  const setFilter = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }))

  const { data: kpis, isLoading: kpisLoading } = useReportKpis(activeOrgId, filters)
  const { data, isLoading } = useReportData(activeOrgId, filters)
  const c = useComputed(data)
  const [tab, setTab] = React.useState<Tab>(canFinancials ? 'Financial' : 'Productivity')

  const productivityRows = canFinancials
    ? c?.productivity ?? []
    : (c?.productivity ?? []).filter((p) => p.id === activeMembership?.id)

  const downloadPdf = () => {
    if (!c || !activeMembership) return
    const org = activeMembership.organization
    const labels: string[] = []
    if (filters.lawyerId && filters.lawyerId !== ALL) labels.push(`Lawyer: ${filterMembers?.find((m) => m.user_id === filters.lawyerId)?.profile?.full_name ?? 'selected'}`)
    if (filters.clientId && filters.clientId !== ALL) labels.push(`Client: ${filterClients?.find((x) => x.id === filters.clientId)?.display_name ?? 'selected'}`)
    if (filters.practiceArea && filters.practiceArea !== ALL) labels.push(`Practice area: ${filters.practiceArea}`)
    printFirmReport({
      firm: { name: org.name, legalName: org.legal_name, logoUrl: org.logo_url },
      preparedBy: `${profile?.full_name ?? 'The Counsel'}${activeMembership.role?.name ? `, ${activeMembership.role.name}` : ''}`,
      period: periodLabel(filters),
      filtersLabel: labels,
      includeFinancial: canFinancials,
      kpis: {
        activeMatters: kpis?.activeMatters ?? 0, closedMatters: kpis?.closedMatters ?? 0, activeClients: kpis?.activeClients ?? 0,
        newClients: kpis?.newClients ?? 0, billableHours: kpis?.billableHours ?? 0, revenue: kpis?.revenue ?? 0,
        outstandingInvoices: kpis?.outstandingInvoices ?? 0, hearingsThisWeek: kpis?.hearingsThisWeek ?? 0, tasksDue: kpis?.tasksDue ?? 0,
      },
      financial: c.financial,
      productivity: productivityRows,
      matters: {
        total: c.matters.total, open: c.matters.open, byStatus: c.matters.byStatus, byArea: c.matters.byArea,
        wipTop: c.matters.wipTop.map((w) => ({ label: w.matter ? `${w.matter.matter_number ?? ''} ${w.matter.title}`.trim() : '—', value: w.value })),
      },
      clients: c.clients,
    })
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Financial, productivity, matter and client analytics for your firm."
        actions={
          <>
          <Button onClick={downloadPdf} disabled={!c || isLoading}><FileDown className="h-4 w-4" /> Download PDF report</Button>
          <ExportButton
            filename="firm-report"
            label="Excel / CSV"
            csv
            disabled={!c}
            sheets={() => {
              if (!c) return []
              const sheets = []
              if (canFinancials) {
                sheets.push(
                  {
                    name: 'Financial summary',
                    rows: [{
                      Invoiced: c.financial.invoiced,
                      Collected: c.financial.collected,
                      Outstanding: c.financial.outstanding,
                      'Collection rate (%)': c.financial.collectionRate,
                    }],
                  },
                  { name: 'Invoiced by month', rows: c.financial.byMonth.map((r) => ({ Month: r.label, Invoiced: r.value })) },
                  { name: 'Outstanding by age', rows: c.financial.aging.map((r) => ({ Age: r.label, Outstanding: r.value })) },
                  {
                    name: 'Revenue by client',
                    rows: c.financial.topClients.map((r) => ({ Client: r.name, Invoiced: r.invoiced, Outstanding: r.outstanding })),
                  },
                )
              }
              sheets.push(
                {
                  name: 'Productivity',
                  rows: productivityRows.map((p) => ({
                    Lawyer: p.name,
                    Role: p.role,
                    'Billable hours': Number(p.billableHours.toFixed(1)),
                    ...(canFinancials ? { 'Billable value': Math.round(p.billableValue) } : {}),
                    'Matters led': p.mattersLed,
                    'Tasks completed (assigned)': p.tasksDone,
                  })),
                },
                { name: 'Matters by status', rows: c.matters.byStatus.map((r) => ({ Status: r.label, Matters: r.value })) },
                { name: 'Matters by area', rows: c.matters.byArea.map((r) => ({ 'Practice area': r.label, Matters: r.value })) },
                {
                  name: 'Clients',
                  rows: c.clients.rows.map((r) => ({
                    Client: r.name,
                    Type: r.type,
                    Matters: r.matters,
                    ...(canFinancials ? { Invoiced: r.invoiced, Outstanding: r.outstanding } : {}),
                  })),
                },
              )
              if (canFinancials) {
                sheets.push({
                  name: 'WIP by matter',
                  rows: c.matters.wipTop.map((w) => ({
                    Matter: w.matter ? `${w.matter.matter_number ?? ''} ${w.matter.title}`.trim() : '—',
                    'Unbilled value': Math.round(w.value),
                  })),
                })
              }
              return sheets
            }}
          />
          </>
        }
      />

      <FiltersBar filters={filters} set={setFilter} reset={() => setFilters({})} />

      {/* Headline numbers for the period, then the rest in one strip. */}
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {canFinancials ? (
          <>
            <StatTile label="Revenue (invoiced)" value={formatMoneyCompact(kpis?.revenue ?? 0)} icon={Banknote} loading={kpisLoading} />
            <StatTile label="Collected" value={formatMoneyCompact(c?.financial.collected ?? 0)} hint={`${c?.financial.collectionRate ?? 0}% collection rate`} icon={CircleDollarSign} loading={kpisLoading || isLoading} />
            <StatTile label="Outstanding invoices" value={formatMoneyCompact(kpis?.outstandingInvoices ?? 0)} icon={AlertTriangle} loading={kpisLoading} emphasis={(kpis?.outstandingInvoices ?? 0) > 0} />
          </>
        ) : (
          <>
            <StatTile label="Active clients" value={String(kpis?.activeClients ?? 0)} icon={Users} loading={kpisLoading} />
            <StatTile label="Hearings this week" value={String(kpis?.hearingsThisWeek ?? 0)} icon={CalendarRange} loading={kpisLoading} />
            <StatTile label="Tasks due" value={String(kpis?.tasksDue ?? 0)} icon={ListChecks} loading={kpisLoading} />
          </>
        )}
        <StatTile label="Active matters" value={String(kpis?.activeMatters ?? 0)} hint={`${kpis?.closedMatters ?? 0} closed`} icon={Briefcase} loading={kpisLoading} />
        <StatTile label="Billable hours" value={`${kpis?.billableHours ?? 0}h`} icon={Clock} loading={kpisLoading} />
      </div>
      <Strip
        loading={kpisLoading}
        items={[
          { label: 'Closed matters', value: String(kpis?.closedMatters ?? 0) },
          ...(canFinancials ? [{ label: 'Active clients', value: String(kpis?.activeClients ?? 0) }] : []),
          { label: 'New clients', value: String(kpis?.newClients ?? 0) },
          ...(canFinancials ? [
            { label: 'Hearings this week', value: String(kpis?.hearingsThisWeek ?? 0) },
            { label: 'Tasks due', value: String(kpis?.tasksDue ?? 0) },
          ] : [
            { label: 'Matters in total', value: String(c?.matters.total ?? 0) },
            { label: 'Open matters', value: String(c?.matters.open ?? 0) },
            { label: 'Clients', value: String(c?.clients.rows.length ?? 0) },
          ]),
        ]}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {isLoading || !c ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      ) : tab === 'Financial' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Invoiced" value={formatMoneyCompact(c.financial.invoiced)} icon={Banknote} />
            <StatTile label="Collected" value={formatMoneyCompact(c.financial.collected)} icon={CircleDollarSign} />
            <StatTile label="Outstanding" value={formatMoneyCompact(c.financial.outstanding)} icon={AlertTriangle} />
            <StatTile label="Collection rate" value={`${c.financial.collectionRate}%`} icon={Percent} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6"><h2 className="mb-4 text-sm font-semibold">Invoiced by month</h2><BarChart data={c.financial.byMonth} formatValue={formatMoneyCompact} /></Card>
            <Card className="p-6"><h2 className="mb-4 text-sm font-semibold">Outstanding by age</h2><DistributionBars data={c.financial.aging} formatValue={formatNaira} /></Card>
          </div>
          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revenue by client</h2></div>
            {c.financial.topClients.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Client</TableHead><TableHead className="text-right">Invoiced</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
                <TableBody>
                  {c.financial.topClients.map((r) => (
                    <TableRow key={r.id}><TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-right text-sm">{formatNaira(r.invoiced)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatNaira(r.outstanding)}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="px-6 py-10 text-center text-sm text-muted-foreground">No invoices yet.</p>}
          </Card>
        </div>
      ) : tab === 'Productivity' ? (
        <div className="space-y-6">
          {!canFinancials && (
            <p className="text-sm text-muted-foreground">You're seeing your own productivity numbers. Firm-wide figures require financial reporting access.</p>
          )}
          {c.hoursChart.length > 0 && canFinancials && (
            <Card className="p-6"><h2 className="mb-4 text-sm font-semibold">Billable hours by lawyer</h2><BarChart data={c.hoursChart} formatValue={(n) => `${n}h`} /></Card>
          )}
          <Card className="overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Lawyer</TableHead><TableHead className="text-right">Billable hrs</TableHead>
                {canFinancials && <TableHead className="text-right">Billable value</TableHead>}
                <TableHead className="text-right">Matters led</TableHead><TableHead className="text-right">Tasks completed (assigned)</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {productivityRows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">{initialsOf(p.name, 'U')}</span>
                      <div><p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">{p.role}</p></div>
                    </div></TableCell>
                    <TableCell className="text-right text-sm">{p.billableHours.toFixed(1)}</TableCell>
                    {canFinancials && <TableCell className="text-right text-sm font-medium">{formatNaira(Math.round(p.billableValue))}</TableCell>}
                    <TableCell className="text-right text-sm">{p.mattersLed}</TableCell>
                    <TableCell className="text-right text-sm">{p.tasksDone}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      ) : tab === 'Matters' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <StatTile label="Total matters" value={String(c.matters.total)} icon={Briefcase} />
            <StatTile label="Open matters" value={String(c.matters.open)} icon={Briefcase} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-6"><h2 className="mb-4 text-sm font-semibold">By status</h2>{c.matters.byStatus.length ? <DistributionBars data={c.matters.byStatus} /> : <p className="py-8 text-center text-sm text-muted-foreground">No matters yet.</p>}</Card>
            <Card className="p-6"><h2 className="mb-4 text-sm font-semibold">By practice area</h2>{c.matters.byArea.length ? <DistributionBars data={c.matters.byArea} /> : <p className="py-8 text-center text-sm text-muted-foreground">No matters yet.</p>}</Card>
          </div>
          {canFinancials && <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3.5"><h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work in progress (unbilled)</h2></div>
            {c.matters.wipTop.length > 0 ? (
              <Table>
                <TableHeader><TableRow><TableHead>Matter</TableHead><TableHead className="text-right">Unbilled value</TableHead></TableRow></TableHeader>
                <TableBody>
                  {c.matters.wipTop.map((w) => (
                    <TableRow key={w.id}><TableCell className="text-sm">{w.matter ? <><span className="font-mono text-xs text-muted-foreground">{w.matter.matter_number}</span> {w.matter.title}</> : '—'}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatNaira(Math.round(w.value))}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : <p className="px-6 py-10 text-center text-sm text-muted-foreground">No unbilled work.</p>}
          </Card>}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatTile label="Clients" value={String(c.clients.rows.length)} icon={Users} />
            <StatTile label="Individuals" value={String(c.clients.individuals)} icon={Users} />
            <StatTile label="Corporate" value={String(c.clients.corporate)} icon={Briefcase} />
          </div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Client</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Matters</TableHead>
                {canFinancials && <><TableHead className="text-right">Invoiced</TableHead><TableHead className="text-right">Outstanding</TableHead></>}
              </TableRow></TableHeader>
              <TableBody>
                {c.clients.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm capitalize text-muted-foreground">{r.type}</TableCell>
                    <TableCell className="text-right text-sm">{r.matters}</TableCell>
                    {canFinancials && <>
                      <TableCell className="text-right text-sm">{formatNaira(r.invoiced)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatNaira(r.outstanding)}</TableCell>
                    </>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
