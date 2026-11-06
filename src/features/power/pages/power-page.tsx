import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, subMonths } from 'date-fns'
import { Plus, Zap, Fuel, Sun, BatteryCharging, Wrench, Trash2, Wallet, Pencil, AlertTriangle, Download } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  LOG_META, SOURCE_KIND_LABEL, kindsFor, serviceStatus, useAddPowerLog, useDeletePowerLog, usePowerLogs, usePowerSources,
  type PowerLog, type PowerLogKind, type PowerSource,
} from '@/features/power/hooks/use-power'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatMoneyCompact, formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

const ALL = '__all__'
const SOURCE_ICON = { grid: Zap, generator: Fuel, solar: Sun, inverter: BatteryCharging } as const
/** Cost series: grid power vs generator, everything else as "other". */
const SERIES = [
  { key: 'grid', label: 'Grid (tokens & bills)', swatch: 'bg-primary' },
  { key: 'generator', label: 'Generator (fuel & service)', swatch: 'bg-sky-700 dark:bg-sky-400' },
  { key: 'other', label: 'Solar & inverter', swatch: 'bg-slate-400 dark:bg-slate-500' },
] as const
type SeriesKey = (typeof SERIES)[number]['key']

const n = (v: number | null | undefined) => Number(v ?? 0)
const monthKey = (d: string) => d.slice(0, 7)

function exportCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <Card className={cn('p-4', tone === 'warn' && 'border-warning/50 bg-warning/5')}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

/** Stacked monthly cost bars with a legend and a hover breakdown. */
function CostChart({ months }: { months: { key: string; label: string; values: Record<SeriesKey, number> }[] }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const total = (m: (typeof months)[number]) => SERIES.reduce((s, x) => s + m.values[x.key], 0)
  const max = Math.max(1, ...months.map(total))
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {SERIES.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-sm', s.swatch)} />{s.label}</span>)}
      </div>
      <div className="relative flex h-52 items-end gap-1.5 border-b border-border sm:gap-3" onMouseLeave={() => setHover(null)}>
        {months.map((m, i) => {
          const t = total(m)
          return (
            <div key={m.key} className="relative flex h-full flex-1 cursor-default flex-col justify-end" onMouseEnter={() => setHover(i)}>
              <div className={cn('flex w-full flex-col-reverse gap-[2px] transition-opacity', hover != null && hover !== i && 'opacity-50')} style={{ height: `${(t / max) * 100}%` }}>
                {SERIES.map((s) => m.values[s.key] > 0 && (
                  <div key={s.key} className={cn(s.swatch, 'w-full last:rounded-t-[4px]')}
                    style={{ flexGrow: m.values[s.key], minHeight: 2 }} />
                ))}
              </div>
              {hover === i && t > 0 && (
                <div className={cn('pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-md border border-border bg-popover p-2.5 text-xs shadow-md', i > months.length / 2 ? 'right-0' : 'left-0')}>
                  <p className="mb-1 font-semibold">{m.label}</p>
                  {SERIES.map((s) => m.values[s.key] > 0 && (
                    <p key={s.key} className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-sm', s.swatch)} />{s.label}</span><span className="tabular-nums">{formatNaira(m.values[s.key])}</span></p>
                  ))}
                  <p className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatNaira(t)}</span></p>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 sm:gap-3">
        {months.map((m) => <span key={m.key} className="flex-1 text-center text-[11px] text-muted-foreground">{m.label.slice(0, 3)}</span>)}
      </div>
    </div>
  )
}

function LogForm({ sources, initialSource, onDone }: { sources: PowerSource[]; initialSource: string | null; onDone: () => void }) {
  const { activeOrgId } = useAuth()
  const add = useAddPowerLog(activeOrgId)
  const [sourceId, setSourceId] = React.useState(initialSource ?? sources[0]?.id ?? '')
  const source = sources.find((s) => s.id === sourceId)
  const kinds = source ? kindsFor(source.kind) : []
  const [kind, setKind] = React.useState<PowerLogKind>(kinds[0] ?? 'token')
  React.useEffect(() => { if (source && !kindsFor(source.kind).includes(kind)) setKind(kindsFor(source.kind)[0]) }, [source, kind])
  const meta = LOG_META[kind]
  const [f, setF] = React.useState({ date: format(new Date(), 'yyyy-MM-dd'), amount: '', quantity: '', reading: '', vendor: '', reference: '', note: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }))
  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  const run = async () => {
    if (!source) { toast.error('Choose a power source'); return }
    const amount = meta.amount ? num(f.amount) : null
    const quantity = meta.quantity ? num(f.quantity) : null
    const reading = meta.reading ? num(f.reading) : null
    if (meta.isCost && kind !== 'service' && !(amount && amount > 0)) { toast.error(`Enter the ${meta.amount?.toLowerCase()}`); return }
    if (kind === 'runtime' && reading == null && quantity == null) { toast.error('Enter the hour meter reading or the hours run'); return }
    if (kind === 'outage' && !(quantity && quantity > 0)) { toast.error('Enter how many hours'); return }
    if (kind === 'reading' && reading == null) { toast.error('Enter the reading'); return }
    try {
      await add.mutateAsync({
        source_id: source.id, kind, log_date: f.date, amount, quantity, meter_reading: reading,
        vendor: f.vendor.trim() || null, reference: f.reference.trim() || null, note: f.note.trim() || null,
      })
      toast.success(`${meta.label} recorded`)
      onDone()
    } catch (err) { toast.error('Could not record it', { description: errorMessage(err) }) }
  }

  return (
    <Card className="space-y-3 border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Log power activity</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Source</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
            <SelectContent>{sources.filter((s) => s.active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>What happened</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PowerLogKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{kinds.map((k) => <SelectItem key={k} value={k}>{LOG_META[k].label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={f.date} max={format(new Date(), 'yyyy-MM-dd')} onChange={set('date')} /></div>
        {meta.amount && <div className="space-y-1.5"><Label>{meta.amount}</Label><Input type="number" min={0} step="0.01" value={f.amount} onChange={set('amount')} /></div>}
        {meta.reading && (
          <div className="space-y-1.5">
            <Label>{meta.reading}</Label>
            <Input type="number" min={0} step="0.1" value={f.reading} onChange={set('reading')} placeholder={source?.hour_meter != null && source.kind === 'generator' ? `Last: ${n(source.hour_meter)}` : undefined} />
          </div>
        )}
        {meta.quantity && <div className="space-y-1.5"><Label>{meta.quantity}</Label><Input type="number" min={0} step="0.01" value={f.quantity} onChange={set('quantity')} disabled={kind === 'runtime' && f.reading.trim() !== ''} /></div>}
        {meta.vendor && <div className="space-y-1.5"><Label>{meta.vendor}</Label><Input value={f.vendor} onChange={set('vendor')} /></div>}
        {meta.reference && <div className="space-y-1.5"><Label>{meta.reference}</Label><Input value={f.reference} onChange={set('reference')} /></div>}
        <div className="space-y-1.5 sm:col-span-3"><Label>Note</Label><Input value={f.note} onChange={set('note')} placeholder="Optional" /></div>
      </div>
      {kind === 'fuel' && f.amount && f.quantity && Number(f.quantity) > 0 && (
        <p className="text-xs text-muted-foreground">That is {formatNaira(Number(f.amount) / Number(f.quantity))} per litre.</p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" loading={add.isPending} onClick={run}>Save</Button>
      </div>
    </Card>
  )
}

function describe(l: PowerLog, unit?: string | null) {
  const parts: string[] = []
  if (l.kind === 'token' || l.kind === 'bill') { if (l.quantity != null) parts.push(`${n(l.quantity)} kWh`) }
  if (l.kind === 'fuel' && l.quantity != null) parts.push(`${n(l.quantity)} litres${l.amount && n(l.quantity) > 0 ? ` @ ${formatNaira(n(l.amount) / n(l.quantity))}/L` : ''}`)
  if (l.kind === 'runtime') parts.push(`${n(l.quantity)} hours run${l.meter_reading != null ? ` · meter ${n(l.meter_reading)}` : ''}`)
  if (l.kind === 'service' && l.meter_reading != null) parts.push(`at ${n(l.meter_reading)} hours`)
  if (l.kind === 'outage') parts.push(`${n(l.quantity)} hours without power`)
  if (l.kind === 'reading') parts.push(`reading ${n(l.meter_reading)}${unit ? ` ${unit}` : ''}`)
  if (l.vendor) parts.push(l.vendor)
  if (l.reference) parts.push(l.reference)
  return parts.join(' · ')
}

/** Electricity & power: grid tokens/bills, generator fuel and running hours,
 * servicing and outages — per branch, with monthly cost. */
export function PowerPage() {
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const since = React.useMemo(() => format(startOfMonth(subMonths(new Date(), 11)), 'yyyy-MM-dd'), [])
  const { data: sources = [], isLoading } = usePowerSources(activeOrgId)
  const { data: logs = [] } = usePowerLogs(activeOrgId, since)
  const { data: branches = [] } = useBranches(activeOrgId)
  const del = useDeletePowerLog()
  const [branch, setBranch] = React.useState(ALL)
  const [sourceFilter, setSourceFilter] = React.useState<string | null>(null)
  const [logging, setLogging] = React.useState<string | null | false>(false)

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Firm-wide'
  const srcById = React.useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const visSources = sources.filter((s) => branch === ALL || s.branch_id === branch)
  const visLogs = logs.filter((l) => (branch === ALL || l.branch_id === branch) && (!sourceFilter || l.source_id === sourceFilter))

  const thisMonth = format(new Date(), 'yyyy-MM')
  const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM')
  const inMonth = (m: string) => visLogs.filter((l) => monthKey(l.log_date) === m)
  const cost = (ls: PowerLog[]) => ls.reduce((s, l) => s + (LOG_META[l.kind].isCost ? n(l.amount) : 0), 0)
  const cur = inMonth(thisMonth)
  const curCost = cost(cur)
  const prevCost = cost(inMonth(lastMonth))
  const litres = cur.filter((l) => l.kind === 'fuel').reduce((s, l) => s + n(l.quantity), 0)
  const genHours = cur.filter((l) => l.kind === 'runtime').reduce((s, l) => s + n(l.quantity), 0)
  const outageHours = cur.filter((l) => l.kind === 'outage').reduce((s, l) => s + n(l.quantity), 0)
  const dueCount = visSources.filter((s) => serviceStatus(s)?.due).length

  const months = React.useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), 11 - i)
    const key = format(d, 'yyyy-MM')
    const values: Record<SeriesKey, number> = { grid: 0, generator: 0, other: 0 }
    for (const l of visLogs) {
      if (monthKey(l.log_date) !== key || !LOG_META[l.kind].isCost) continue
      const k = srcById.get(l.source_id)?.kind
      values[k === 'grid' ? 'grid' : k === 'generator' ? 'generator' : 'other'] += n(l.amount)
    }
    return { key, label: format(d, 'MMMM yyyy'), values }
  }), [visLogs, srcById])

  const requestFunds = () => {
    const s = sourceFilter ? srcById.get(sourceFilter) : visSources.find((x) => x.kind === 'generator') ?? visSources[0]
    const what = s?.kind === 'generator' ? `${s.fuel_type ?? 'diesel'} for ${s.name}` : s ? `electricity tokens for ${s.name}` : 'power'
    navigate(`/hr/funds/new?category=utilities&title=${encodeURIComponent(`Purchase of ${what}`)}`)
  }

  return (
    <div>
      <PageHeader
        title="Electricity & Power"
        description="Grid tokens and bills, generator fuel, running hours and servicing — what power costs each office."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={requestFunds}><Wallet className="h-4 w-4" /> Request funds</Button>
            <Button variant="outline" onClick={() => navigate('/hr/power/sources/new')}><Plus className="h-4 w-4" /> Add source</Button>
            {sources.length > 0 && <Button onClick={() => setLogging(sourceFilter)}><Plus className="h-4 w-4" /> Log activity</Button>}
          </div>
        }
      />

      {branches.length > 1 && (
        <div className="mb-4 w-56">
          <Select value={branch} onValueChange={(v) => { setBranch(v); setSourceFilter(null) }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? <Skeleton className="h-96 w-full" /> : sources.length === 0 ? (
        <Card className="p-10 text-center">
          <Zap className="mx-auto mb-3 h-8 w-8 text-primary" />
          <p className="font-medium">Start by adding your power sources</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Each office's prepaid or postpaid meter, generators, and any solar or inverter system. Then log tokens, fuel and running hours as they happen.</p>
          <Button className="mt-4" onClick={() => navigate('/hr/power/sources/new')}><Plus className="h-4 w-4" /> Add a power source</Button>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label={`Power cost · ${format(new Date(), 'MMMM')}`} value={formatMoneyCompact(curCost)}
              sub={prevCost ? `${curCost >= prevCost ? '+' : ''}${Math.round(((curCost - prevCost) / prevCost) * 100)}% vs last month` : undefined} />
            <Kpi label="Fuel bought this month" value={`${litres.toLocaleString()} L`} sub={litres ? `${formatNaira(cur.filter((l) => l.kind === 'fuel').reduce((s, l) => s + n(l.amount), 0) / litres)} per litre avg.` : undefined} />
            <Kpi label="Generator hours this month" value={genHours.toLocaleString()} sub={outageHours ? `${outageHours} hours of grid outage logged` : undefined} />
            <Kpi label="Generators due for service" value={String(dueCount)} tone={dueCount ? 'warn' : undefined} />
          </div>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">Monthly power cost</p>
              <p className="text-sm text-muted-foreground">Last 12 months · {formatNaira(months.reduce((s, m) => s + m.values.grid + m.values.generator + m.values.other, 0))}</p>
            </div>
            <CostChart months={months} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visSources.map((s) => {
              const Icon = SOURCE_ICON[s.kind]
              const svc = serviceStatus(s)
              const sLogs = inMonth(thisMonth).filter((l) => l.source_id === s.id)
              const selected = sourceFilter === s.id
              return (
                <Card key={s.id} onClick={() => setSourceFilter(selected ? null : s.id)}
                  className={cn('cursor-pointer space-y-3 p-4 transition-colors hover:border-primary/50', selected && 'border-primary ring-1 ring-primary', !s.active && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                      <div>
                        <p className="font-medium leading-tight">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{SOURCE_KIND_LABEL[s.kind]}{s.capacity ? ` · ${s.capacity}` : ''} · {branchName(s.branch_id)}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); navigate(`/hr/power/sources/${s.id}/edit`) }}><Pencil className="h-3.5 w-3.5" /></Button>
                  </div>
                  {svc && (
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className={cn('flex items-center gap-1', svc.due ? 'font-medium text-warning' : 'text-muted-foreground')}>
                          {svc.due && <AlertTriangle className="h-3 w-3" />}{svc.overdue ? 'Service overdue' : svc.due ? 'Service due soon' : 'Next service'}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{Math.round(svc.since)} / {svc.interval} hrs</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', svc.due ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, svc.pct * 100)}%` }} />
                      </div>
                      {s.last_service_on && <p className="mt-1 text-[11px] text-muted-foreground">Last serviced {format(new Date(s.last_service_on), 'd MMM yyyy')}</p>}
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="text-muted-foreground">This month</span>
                    <span className="font-medium tabular-nums">{formatNaira(cost(sLogs))}</span>
                  </div>
                  <Button size="sm" variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); setLogging(s.id) }}>
                    {s.kind === 'grid' ? 'Log token / bill / outage' : s.kind === 'generator' ? 'Log fuel / hours / service' : 'Log reading / service'}
                  </Button>
                </Card>
              )
            })}
          </div>

          {logging !== false && <LogForm key={String(logging)} sources={visSources.length ? visSources : sources} initialSource={logging} onDone={() => setLogging(false)} />}

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <p className="text-sm font-semibold">
                Activity{sourceFilter && ` · ${srcById.get(sourceFilter)?.name}`}
                {sourceFilter && <button className="ml-2 text-xs font-normal text-primary hover:underline" onClick={() => setSourceFilter(null)}>show all</button>}
              </p>
              <Button size="sm" variant="ghost" onClick={() => exportCsv('power-log.csv', [['Date', 'Source', 'Branch', 'Type', 'Amount', 'Quantity', 'Meter reading', 'Vendor', 'Reference', 'Note'],
                ...visLogs.map((l) => [l.log_date, srcById.get(l.source_id)?.name ?? '', branchName(l.branch_id), LOG_META[l.kind].label, l.amount, l.quantity, l.meter_reading, l.vendor, l.reference, l.note])])}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
            {visLogs.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Nothing logged in the last 12 months.</p> : (
              <ul className="divide-y divide-border">
                {visLogs.slice(0, 100).map((l) => {
                  const s = srcById.get(l.source_id)
                  const canDelete = l.created_by === userId && Date.now() - new Date(l.created_at).getTime() < 7 * 864e5
                  return (
                    <li key={l.id} className="group flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">{format(new Date(l.log_date), 'd MMM')}</span>
                        <div className="min-w-0">
                          <p className="font-medium">{LOG_META[l.kind].label} <span className="font-normal text-muted-foreground">· {s?.name}</span>{l.kind === 'service' && <Wrench className="ml-1 inline h-3 w-3 text-muted-foreground" />}</p>
                          <p className="truncate text-xs text-muted-foreground">{[describe(l), l.note].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {l.amount != null && n(l.amount) > 0 && <span className="tabular-nums">{formatNaira(n(l.amount))}</span>}
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" title="Delete (logged by mistake)"
                            onClick={() => window.confirm('Delete this entry?') && del.mutate(l.id, { onSuccess: () => toast.success('Deleted'), onError: (e) => toast.error('Could not delete', { description: errorMessage(e) }) })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          {visSources.some((s) => s.kind === 'generator') && <GeneratorEfficiency sources={visSources.filter((s) => s.kind === 'generator')} logs={visLogs} />}
        </div>
      )}
    </div>
  )
}

/** Litres per running hour, per generator, over the last 12 months — a
 * rising number means a fault, a leak or fuel going missing. */
function GeneratorEfficiency({ sources, logs }: { sources: PowerSource[]; logs: PowerLog[] }) {
  const rows = sources.map((s) => {
    const ls = logs.filter((l) => l.source_id === s.id)
    const litres = ls.filter((l) => l.kind === 'fuel').reduce((a, l) => a + n(l.quantity), 0)
    const hours = ls.filter((l) => l.kind === 'runtime').reduce((a, l) => a + n(l.quantity), 0)
    const spend = ls.filter((l) => LOG_META[l.kind].isCost).reduce((a, l) => a + n(l.amount), 0)
    return { s, litres, hours, spend, lph: hours > 0 ? litres / hours : null, cph: hours > 0 ? spend / hours : null }
  })
  return (
    <Card className="overflow-hidden">
      <p className="border-b border-border px-4 py-2 text-sm font-semibold">Generator fuel use · last 12 months</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Generator</th><th className="px-4 py-2 text-right font-medium">Fuel bought</th>
            <th className="px-4 py-2 text-right font-medium">Hours run</th><th className="px-4 py-2 text-right font-medium">Litres / hour</th>
            <th className="px-4 py-2 text-right font-medium">Cost / hour</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2.5 font-medium">{r.s.name}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.litres.toLocaleString()} L</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.hours.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.lph != null ? r.lph.toFixed(1) : '—'}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.cph != null ? formatNaira(r.cph) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Log running hours regularly so litres per hour stays accurate. A sudden rise usually means a fault, a leak or missing fuel.</p>
    </Card>
  )
}
