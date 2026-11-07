import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Pencil, Trash2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useEmployeeRegister } from '@/features/hr/hooks/use-employees'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  ASSET_STATUS_META, MOVEMENT_LABEL, isLowStock, useAcknowledgeAsset, useDeleteInventoryItem, useInventoryItem,
  useInventoryMove, useInventoryMovements, type InventoryItem,
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
import { formatNaira as formatMoney } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Action = 'received' | 'issued' | 'adjusted' | 'assigned' | 'unassigned' | 'repair' | 'disposed' | 'lost'
const NONE = '__none__'

const ACTION_COPY: Record<Action, { label: string; button: string; hint: string }> = {
  received: { label: 'Receive stock', button: 'Add to stock', hint: 'New stock delivered or bought.' },
  issued: { label: 'Issue', button: 'Issue', hint: 'Hand some out (to a person, or for general use).' },
  adjusted: { label: 'Stock count', button: 'Set the count', hint: 'After counting the shelf — sets the stock to exactly this number.' },
  assigned: { label: 'Assign to staff', button: 'Assign', hint: 'They will be asked to confirm they received it.' },
  unassigned: { label: 'Return to store', button: 'Record return', hint: 'They handed it back.' },
  repair: { label: 'Send for repair', button: 'Send for repair', hint: 'Out of use until it comes back.' },
  disposed: { label: 'Dispose', button: 'Dispose', hint: 'Sold, scrapped or written off — this is final.' },
  lost: { label: 'Mark as lost', button: 'Mark lost', hint: 'Stolen or missing — this is final.' },
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  )
}

function availableActions(it: InventoryItem): Action[] {
  if (it.kind === 'supply') return ['received', 'issued', 'adjusted']
  if (it.status === 'disposed' || it.status === 'lost') return []
  if (it.status === 'assigned') return ['unassigned', 'repair', 'lost']
  if (it.status === 'repair') return ['unassigned', 'disposed']
  return ['assigned', 'repair', 'disposed', 'lost']
}

function ActionPanel({ item, action, onDone }: { item: InventoryItem; action: Action; onDone: () => void }) {
  const { activeOrgId } = useAuth()
  const { data: register = [] } = useEmployeeRegister(activeOrgId)
  const move = useInventoryMove()
  const [qty, setQty] = React.useState('')
  const [emp, setEmp] = React.useState(NONE)
  const [note, setNote] = React.useState('')
  const [cost, setCost] = React.useState('')
  const [condition, setCondition] = React.useState('good')
  const copy = ACTION_COPY[action]
  const needsQty = item.kind === 'supply'
  const needsEmp = action === 'assigned'
  const optionalEmp = action === 'issued'
  const staff = register.filter((e) => !['terminated', 'resigned', 'exited'].includes(e.employment_status))

  const run = async () => {
    const q = qty.trim() === '' ? null : Number(qty)
    if (needsQty && (q == null || q < 0 || (action !== 'adjusted' && q === 0))) { toast.error('Enter a quantity'); return }
    if (needsEmp && emp === NONE) { toast.error('Choose who it is assigned to'); return }
    try {
      await move.mutateAsync({
        item: item.id, kind: action, quantity: needsQty ? q : null, employee: emp === NONE ? null : emp, note,
        unitCost: action === 'received' && cost ? Number(cost) : null, condition: action === 'unassigned' ? condition : null,
      })
      toast.success('Recorded')
      onDone()
    } catch (err) { toast.error('Could not record that', { description: errorMessage(err) }) }
  }

  return (
    <Card className={cn('space-y-3 p-4', action === 'disposed' || action === 'lost' ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5')}>
      <div>
        <p className="text-sm font-semibold">{copy.label}</p>
        <p className="text-xs text-muted-foreground">{copy.hint}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {needsQty && (
          <div className="space-y-1.5">
            <Label>{action === 'adjusted' ? 'Counted on the shelf' : 'Quantity'}{item.unit ? ` (${item.unit})` : ''}</Label>
            <Input type="number" min={0} autoFocus value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        )}
        {action === 'received' && (
          <div className="space-y-1.5"><Label>Unit cost (optional)</Label><Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
        )}
        {(needsEmp || optionalEmp) && (
          <div className="space-y-1.5">
            <Label>{needsEmp ? 'Assign to' : 'Given to (optional)'}</Label>
            <Select value={emp} onValueChange={setEmp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{needsEmp ? 'Choose a staff member' : 'General office use'}</SelectItem>
                {staff.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}{e.branchName ? ` · ${e.branchName}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {action === 'unassigned' && (
          <div className="space-y-1.5">
            <Label>Condition on return</Label>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{['new', 'good', 'fair', 'poor', 'damaged'].map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <div className={cn('space-y-1.5', !(needsQty || needsEmp || optionalEmp || action === 'unassigned') && 'sm:col-span-2')}>
          <Label>Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" variant={action === 'disposed' || action === 'lost' ? 'destructive' : 'default'} loading={move.isPending} onClick={run}>{copy.button}</Button>
      </div>
    </Card>
  )
}

/** One asset or supply line: details, the actions a manager can take, and
 * its full movement history. */
export function InventoryItemPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId, userId } = useAuth()
  const { has } = usePermissions()
  const canManage = has('inventory.manage')
  const { data: item, isLoading } = useInventoryItem(id)
  const { data: movements = [] } = useInventoryMovements(id)
  const { data: register = [] } = useEmployeeRegister(canManage ? activeOrgId : null)
  const { data: branches = [] } = useBranches(activeOrgId)
  const del = useDeleteInventoryItem()
  const ack = useAcknowledgeAsset()
  const [action, setAction] = React.useState<Action | null>(null)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (!item) return <Card className="p-10 text-center text-muted-foreground">This item doesn't exist or you can't see it.</Card>

  const empName = (eid: string | null) => (eid ? register.find((e) => e.id === eid)?.fullName ?? 'Staff member' : null)
  const assignee = register.find((e) => e.id === item.assigned_employee_id)
  const isMine = item.status === 'assigned' && (!canManage || assignee?.user_id === userId)
  const isAsset = item.kind === 'asset'
  const low = isLowStock(item)
  const status = ASSET_STATUS_META[item.status]

  const remove = async () => {
    if (!window.confirm(`Delete ${item.name}? Its history is deleted too. Use "Dispose" instead if it simply left the firm.`)) return
    try { await del.mutateAsync(item.id); toast.success('Deleted'); navigate('/hr/inventory', { replace: true }) }
    catch (err) { toast.error('Could not delete', { description: errorMessage(err) }) }
  }

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate(`/hr/inventory?tab=${isAsset ? 'assets' : 'supplies'}`)}><ArrowLeft className="h-4 w-4" /> Inventory</Button>
      <PageHeader
        title={item.name}
        description={isAsset ? `${item.tag_no ?? ''}${item.category ? ` · ${item.category}` : ''}` : item.category ?? 'Supply'}
        actions={canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/hr/inventory/${item.id}/edit`)}><Pencil className="h-4 w-4" /> Edit</Button>
            {movements.length <= 1 && <Button variant="ghost" onClick={remove} loading={del.isPending}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ) : undefined}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card className="p-5">
            {isAsset ? (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Badge variant={status.variant}>{status.label}</Badge>
                {item.status === 'assigned' && (
                  <span className="text-sm">
                    with <strong>{canManage ? empName(item.assigned_employee_id) : 'you'}</strong>
                    {item.assigned_at && ` since ${format(new Date(item.assigned_at), 'd MMM yyyy')}`}
                    {item.assignment_acknowledged_at
                      ? <span className="ml-2 text-success">· confirmed received</span>
                      : <span className="ml-2 text-warning">· not yet confirmed</span>}
                  </span>
                )}
              </div>
            ) : (
              <div className="mb-4 flex items-end gap-3">
                <p className={cn('font-display text-4xl font-semibold tabular-nums', low && 'text-warning')}>{Number(item.quantity)}</p>
                <p className="pb-1 text-sm text-muted-foreground">{item.unit ?? 'units'} in stock</p>
                {low && <Badge variant="warning" className="mb-1.5"><AlertTriangle className="mr-1 h-3 w-3" /> Reorder</Badge>}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Fact label="Branch" value={branches.find((b) => b.id === item.branch_id)?.name ?? 'Firm-wide'} />
              <Fact label="Location" value={item.location} />
              {isAsset ? (
                <>
                  <Fact label="Serial number" value={item.serial_no} />
                  <Fact label="Condition" value={item.condition && item.condition.charAt(0).toUpperCase() + item.condition.slice(1)} />
                  <Fact label="Purchased" value={item.purchase_date && format(new Date(item.purchase_date), 'd MMM yyyy')} />
                  <Fact label="Cost" value={item.purchase_cost != null && formatMoney(Number(item.purchase_cost))} />
                  <Fact label="Supplier" value={item.supplier} />
                  <Fact label="Warranty until" value={item.warranty_until && (
                    <span className={cn(new Date(item.warranty_until) < new Date() && 'text-muted-foreground line-through')}>{format(new Date(item.warranty_until), 'd MMM yyyy')}</span>
                  )} />
                </>
              ) : (
                <>
                  <Fact label="Reorder at" value={item.reorder_level != null && `${item.reorder_level} ${item.unit ?? ''}`} />
                  <Fact label="Unit cost" value={item.unit_cost != null && formatMoney(Number(item.unit_cost))} />
                  <Fact label="Stock value" value={item.unit_cost != null && formatMoney(Number(item.quantity) * Number(item.unit_cost))} />
                </>
              )}
            </div>
            {(item.description || item.notes) && (
              <div className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                {item.description && <p>{item.description}</p>}
                {item.notes && <p>{item.notes}</p>}
              </div>
            )}
          </Card>

          {isMine && !item.assignment_acknowledged_at && (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/30 bg-primary/5 p-4">
              <p className="text-sm">This has been assigned to you. Please confirm you have it.</p>
              <Button size="sm" loading={ack.isPending} onClick={() => ack.mutate(item.id, { onSuccess: () => toast.success('Recorded as received'), onError: (e) => toast.error('Could not confirm', { description: errorMessage(e) }) })}>
                <CheckCircle2 className="h-4 w-4" /> Confirm I received it
              </Button>
            </Card>
          )}

          {canManage && action && <ActionPanel key={action} item={item} action={action} onDone={() => setAction(null)} />}

          <Card className="overflow-hidden">
            <p className="border-b border-border px-4 py-2 text-sm font-semibold">History</p>
            {movements.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nothing recorded yet.</p> : (
              <ul className="divide-y divide-border">
                {movements.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium">
                        {MOVEMENT_LABEL[m.kind] ?? m.kind}
                        {m.quantity != null && <span className="text-muted-foreground"> {m.kind === 'adjusted' ? '→' : '×'} {Number(m.quantity)}</span>}
                        {m.employee_id && canManage && <span className="font-normal text-muted-foreground"> · {empName(m.employee_id)}</span>}
                      </p>
                      {m.note && <p className="text-xs text-muted-foreground">{m.note}</p>}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>{format(new Date(m.created_at), 'd MMM yyyy, HH:mm')}</p>
                      {m.balance_after != null && <p>Balance {Number(m.balance_after)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {canManage && (
          <Card className="h-fit space-y-2 p-4">
            <p className="text-sm font-semibold">Actions</p>
            {availableActions(item).length === 0 && <p className="text-sm text-muted-foreground">This asset is {status.label.toLowerCase()} — no further changes.</p>}
            {availableActions(item).map((a) => (
              <Button key={a} variant={action === a ? 'default' : 'outline'} className={cn('w-full justify-start', (a === 'disposed' || a === 'lost') && action !== a && 'text-destructive')}
                onClick={() => setAction(action === a ? null : a)}>
                {ACTION_COPY[a].label}
              </Button>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
