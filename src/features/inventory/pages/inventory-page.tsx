import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Package, Laptop, Plus, Search, AlertTriangle, CheckCircle2, Inbox, Download } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { useApprovalRights } from '@/features/hr/hooks/use-approval-rules'
import { useMyReports } from '@/features/hr/hooks/use-my-reports'
import {
  ASSET_STATUS_META, REQUEST_STATUS_META, isLowStock, useAcknowledgeAsset, useCancelInventoryRequest, useDecideInventoryRequest,
  useInventoryItems, useInventoryRequests, useIssueInventoryRequest, useRequestInventory, type InventoryItem, type InventoryRequest,
} from '@/features/inventory/hooks/use-inventory'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatMoneyCompact } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Tab = 'assets' | 'supplies' | 'requests' | 'mine'
const NONE = '__none__'

function exportCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <Card className={cn('p-4', tone === 'warn' && 'border-warning/50 bg-warning/5')}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn('font-display text-2xl font-semibold tabular-nums', tone === 'warn' && 'text-warning')}>{value}</p>
    </Card>
  )
}

function RequestForm({ supplies, onDone }: { supplies: InventoryItem[]; onDone: () => void }) {
  const { activeOrgId } = useAuth()
  const req = useRequestInventory(activeOrgId)
  const [item, setItem] = React.useState(NONE)
  const [name, setName] = React.useState('')
  const [qty, setQty] = React.useState('1')
  const [reason, setReason] = React.useState('')
  const run = async () => {
    const q = Number(qty)
    if (!(q > 0)) { toast.error('Enter a quantity'); return }
    if (item === NONE && !name.trim()) { toast.error('Choose an item or describe what you need'); return }
    try {
      await req.mutateAsync({ item: item === NONE ? null : item, name: item === NONE ? name.trim() : undefined, quantity: q, reason: reason.trim() })
      toast.success('Request sent', { description: 'Your line manager (or an inventory manager) will approve it, then it is issued to you.' })
      onDone()
    } catch (err) { toast.error('Could not send the request', { description: errorMessage(err) }) }
  }
  return (
    <Card className="space-y-3 border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Request an item</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px]">
        <div className="space-y-1.5">
          <Label>From the store</Label>
          <Select value={item} onValueChange={setItem}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Something else (describe it)</SelectItem>
              {supplies.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.unit ? ` (${s.unit})` : ''}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{item === NONE ? 'What do you need?' : 'Item'}</Label>
          <Input disabled={item !== NONE} value={item === NONE ? name : supplies.find((s) => s.id === item)?.name ?? ''} onChange={(e) => setName(e.target.value)} placeholder="e.g. A new laptop charger" />
        </div>
        <div className="space-y-1.5"><Label>Quantity</Label><Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label>Why (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. For the Cargo Loss trial bundles" /></div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={run} loading={req.isPending}>Send request</Button>
      </div>
    </Card>
  )
}

function RequestRow({ r, canDecide, canIssue, isMine, items }: { r: InventoryRequest; canDecide: boolean; canIssue: boolean; isMine: boolean; items: InventoryItem[] }) {
  const decide = useDecideInventoryRequest()
  const issue = useIssueInventoryRequest()
  const cancel = useCancelInventoryRequest()
  const [declining, setDeclining] = React.useState(false)
  const [note, setNote] = React.useState('')
  const [pick, setPick] = React.useState(r.item_id ?? NONE)
  const st = REQUEST_STATUS_META[r.status]
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast.success(done) } catch (err) { toast.error('Action failed', { description: errorMessage(err) }) }
  }
  const issuable = items.filter((i) => (i.kind === 'supply' && Number(i.quantity) >= Number(r.quantity)) || (i.kind === 'asset' && i.status === 'in_store'))
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{r.item_name} <span className="text-muted-foreground">×{Number(r.quantity)}</span></p>
          <p className="text-xs text-muted-foreground">{isMine ? 'You' : r.requester_name ?? 'Someone'} · {format(new Date(r.created_at), 'd MMM yyyy')}{r.reason ? ` · “${r.reason}”` : ''}</p>
          {r.decision_note && <p className="text-xs text-muted-foreground">Note: {r.decision_note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={st.variant}>{st.label}</Badge>
          {canDecide && r.status === 'pending' && !declining && (
            <>
              <Button size="sm" variant="outline" onClick={() => setDeclining(true)}>Decline</Button>
              <Button size="sm" loading={decide.isPending} onClick={() => act(() => decide.mutateAsync({ id: r.id, approve: true }), 'Approved — an inventory manager will issue it')}>Approve</Button>
            </>
          )}
          {isMine && (r.status === 'pending' || r.status === 'approved') && (
            <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => act(() => cancel.mutateAsync(r.id), 'Request cancelled')}>Cancel</Button>
          )}
        </div>
      </div>
      {declining && (
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-sm" placeholder="Reason for declining" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" variant="outline" onClick={() => setDeclining(false)}>Back</Button>
          <Button size="sm" loading={decide.isPending} onClick={() => act(() => decide.mutateAsync({ id: r.id, approve: false, note }), 'Request declined').then(() => setDeclining(false))}>Decline</Button>
        </div>
      )}
      {canIssue && r.status === 'approved' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
          <span className="text-xs text-muted-foreground">Issue from:</span>
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Choose the item" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Choose the item</SelectItem>
              {issuable.map((i) => <SelectItem key={i.id} value={i.id}>{i.kind === 'asset' ? `${i.tag_no} · ${i.name}` : `${i.name} (${Number(i.quantity)} in stock)`}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={pick === NONE} loading={issue.isPending} onClick={() => act(() => issue.mutateAsync({ id: r.id, item: pick }), 'Issued')}>Issue</Button>
        </div>
      )}
    </li>
  )
}

/** Office assets and supplies: the register, staff requests and "my items". */
export function InventoryPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('inventory.manage')
  const { can } = useApprovalRights()
  const { reportUserIds } = useMyReports()
  const { data: items = [], isLoading } = useInventoryItems(activeOrgId)
  const { data: requests = [] } = useInventoryRequests(activeOrgId)
  const { data: register = [] } = useEmployeeRegister(canManage ? activeOrgId : null)
  const { data: branches = [] } = useBranches(activeOrgId)
  const ack = useAcknowledgeAsset()
  const tab = (params.get('tab') as Tab) || (canManage ? 'assets' : 'mine')
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const [search, setSearch] = React.useState('')
  const [requesting, setRequesting] = React.useState(false)

  const empName = React.useMemo(() => new Map(register.map((e) => [e.id, e.fullName])), [register])
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? '—'
  const assets = items.filter((i) => i.kind === 'asset')
  const supplies = items.filter((i) => i.kind === 'supply')
  const myEmployeeIds = new Set(register.filter((e) => e.user_id === userId).map((e) => e.id))
  const mine = assets.filter((a) => a.status === 'assigned' && (myEmployeeIds.has(a.assigned_employee_id ?? '') || !canManage))
  const low = supplies.filter(isLowStock)
  const toAct = requests.filter((r) => r.user_id !== userId && ((r.status === 'pending' && (can('inventory') || reportUserIds.has(r.user_id))) || (r.status === 'approved' && canManage)))
  const q = search.toLowerCase()
  const match = (i: InventoryItem) => !q || `${i.name} ${i.tag_no ?? ''} ${i.serial_no ?? ''} ${i.category ?? ''} ${empName.get(i.assigned_employee_id ?? '') ?? ''}`.toLowerCase().includes(q)

  const tabs: { key: Tab; label: string; show: boolean; count?: number }[] = [
    { key: 'assets', label: 'Assets', show: canManage },
    { key: 'supplies', label: 'Supplies', show: true, count: canManage ? low.length : undefined },
    { key: 'requests', label: 'Requests', show: true, count: toAct.length },
    { key: 'mine', label: 'My items', show: true, count: mine.filter((m) => !m.assignment_acknowledged_at).length },
  ]

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Office assets and supplies — who has what, what's in stock, and requests for more."
        actions={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate('/hr/inventory/new?kind=supply')}><Package className="h-4 w-4" /> Add supply</Button>
            <Button onClick={() => navigate('/hr/inventory/new?kind=asset')}><Plus className="h-4 w-4" /> Add asset</Button>
          </div>
        ) : undefined}
      />

      {canManage && (
        <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Assets" value={String(assets.filter((a) => a.status !== 'disposed').length)} />
          <Kpi label="Assigned to staff" value={String(assets.filter((a) => a.status === 'assigned').length)} />
          <Kpi label="Asset value" value={formatMoneyCompact(assets.filter((a) => a.status !== 'disposed').reduce((s, a) => s + Number(a.purchase_cost ?? 0), 0))} />
          <Kpi label="Supplies running low" value={String(low.length)} tone={low.length ? 'warn' : undefined} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap rounded-lg border border-border p-0.5">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
              {t.count ? <span className={cn('rounded-full px-1.5 text-[11px]', tab === t.key ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary')}>{t.count}</span> : null}
            </button>
          ))}
        </div>
        {(tab === 'assets' || tab === 'supplies') && (
          <div className="flex gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {canManage && (
              <Button variant="outline" onClick={() => tab === 'assets'
                ? exportCsv('asset-register.csv', [['Tag', 'Name', 'Category', 'Serial', 'Status', 'Assigned to', 'Branch', 'Condition', 'Purchase date', 'Cost'],
                    ...assets.map((a) => [a.tag_no, a.name, a.category, a.serial_no, ASSET_STATUS_META[a.status].label, empName.get(a.assigned_employee_id ?? '') ?? '', branchName(a.branch_id), a.condition, a.purchase_date, a.purchase_cost])])
                : exportCsv('supplies.csv', [['Name', 'Category', 'In stock', 'Unit', 'Reorder level', 'Unit cost', 'Value', 'Branch'],
                    ...supplies.map((s) => [s.name, s.category, Number(s.quantity), s.unit, s.reorder_level, s.unit_cost, Number(s.quantity) * Number(s.unit_cost ?? 0), branchName(s.branch_id)])])}>
                <Download className="h-4 w-4" /> Export
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? <Skeleton className="h-72 w-full" /> : (
        <>
          {tab === 'assets' && canManage && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Tag</th><th className="px-4 py-2 font-medium">Asset</th><th className="px-4 py-2 font-medium">Assigned to</th>
                    <th className="px-4 py-2 font-medium">Branch</th><th className="px-4 py-2 font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {assets.filter(match).map((a) => (
                      <tr key={a.id} onClick={() => navigate(`/hr/inventory/${a.id}`)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-mono text-xs">{a.tag_no}</td>
                        <td className="px-4 py-2.5"><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{[a.category, a.serial_no && `SN ${a.serial_no}`].filter(Boolean).join(' · ')}</p></td>
                        <td className="px-4 py-2.5">{a.assigned_employee_id ? empName.get(a.assigned_employee_id) ?? 'Staff member' : '—'}{a.status === 'assigned' && !a.assignment_acknowledged_at && <span className="ml-1 text-xs text-warning">(not yet confirmed)</span>}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{branchName(a.branch_id)}</td>
                        <td className="px-4 py-2.5"><Badge variant={ASSET_STATUS_META[a.status].variant}>{ASSET_STATUS_META[a.status].label}</Badge></td>
                      </tr>
                    ))}
                    {assets.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground"><Laptop className="mx-auto mb-2 h-6 w-6" />No assets yet — add laptops, phones, printers, furniture or vehicles.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tab === 'supplies' && (
            <div className="space-y-4">
              {!canManage && !requesting && <Button onClick={() => setRequesting(true)}><Plus className="h-4 w-4" /> Request an item</Button>}
              {requesting && <RequestForm supplies={supplies} onDone={() => setRequesting(false)} />}
              {canManage && low.length > 0 && (
                <Card className="flex items-center gap-3 border-warning/40 bg-warning/5 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-warning" /> {low.length} supply line{low.length === 1 ? ' is' : 's are'} at or below the reorder level.</Card>
              )}
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Item</th><th className="px-4 py-2 text-right font-medium">In stock</th>
                      {canManage && <th className="px-4 py-2 text-right font-medium">Reorder at</th>}
                      {canManage && <th className="px-4 py-2 text-right font-medium">Value</th>}
                      <th className="px-4 py-2 font-medium">Branch</th>
                    </tr></thead>
                    <tbody>
                      {supplies.filter(match).map((s) => (
                        <tr key={s.id} onClick={() => canManage && navigate(`/hr/inventory/${s.id}`)} className={cn('border-b border-border/60 last:border-0', canManage && 'cursor-pointer hover:bg-muted/40')}>
                          <td className="px-4 py-2.5"><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.category ?? ''}</p></td>
                          <td className={cn('px-4 py-2.5 text-right tabular-nums', isLowStock(s) && 'font-semibold text-warning')}>{Number(s.quantity)} {s.unit ?? ''}</td>
                          {canManage && <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{s.reorder_level ?? '—'}</td>}
                          {canManage && <td className="px-4 py-2.5 text-right tabular-nums">{s.unit_cost ? formatMoneyCompact(Number(s.quantity) * Number(s.unit_cost)) : '—'}</td>}
                          <td className="px-4 py-2.5 text-muted-foreground">{branchName(s.branch_id)}</td>
                        </tr>
                      ))}
                      {supplies.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground"><Package className="mx-auto mb-2 h-6 w-6" />No supplies recorded yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {tab === 'requests' && (
            <div className="space-y-4">
              {!requesting && <Button variant="outline" onClick={() => setRequesting(true)}><Plus className="h-4 w-4" /> Request an item</Button>}
              {requesting && <RequestForm supplies={supplies} onDone={() => setRequesting(false)} />}
              {toAct.length > 0 && (
                <Card className="overflow-hidden">
                  <p className="border-b border-border px-4 py-2 text-sm font-semibold">Waiting for you</p>
                  <ul className="divide-y divide-border">
                    {toAct.map((r) => <RequestRow key={r.id} r={r} items={items} isMine={false}
                      canDecide={r.status === 'pending' && (can('inventory', r.branch_id) || reportUserIds.has(r.user_id))} canIssue={canManage} />)}
                  </ul>
                </Card>
              )}
              <Card className="overflow-hidden">
                <p className="border-b border-border px-4 py-2 text-sm font-semibold">{canManage ? 'All requests' : 'My requests'}</p>
                {requests.filter((r) => canManage || r.user_id === userId).length === 0 ? (
                  <p className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Inbox className="h-4 w-4" /> No requests yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {requests.filter((r) => canManage || r.user_id === userId).map((r) => <RequestRow key={r.id} r={r} items={items} isMine={r.user_id === userId} canDecide={false} canIssue={false} />)}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {tab === 'mine' && (
            <Card className="overflow-hidden">
              {mine.length === 0 ? (
                <p className="p-10 text-center text-sm text-muted-foreground">Nothing is assigned to you.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {mine.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-medium">{a.name} <span className="font-mono text-xs text-muted-foreground">{a.tag_no}</span></p>
                        <p className="text-xs text-muted-foreground">{[a.serial_no && `SN ${a.serial_no}`, a.assigned_at && `since ${format(new Date(a.assigned_at), 'd MMM yyyy')}`].filter(Boolean).join(' · ')}</p>
                      </div>
                      {a.assignment_acknowledged_at ? (
                        <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Received {format(new Date(a.assignment_acknowledged_at), 'd MMM')}</span>
                      ) : (
                        <Button size="sm" loading={ack.isPending} onClick={() => ack.mutate(a.id, { onSuccess: () => toast.success('Thanks — recorded as received'), onError: (e) => toast.error('Could not confirm', { description: errorMessage(e) }) })}>
                          <CheckCircle2 className="h-4 w-4" /> Confirm I received it
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
