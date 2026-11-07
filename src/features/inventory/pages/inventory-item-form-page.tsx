import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import {
  ASSET_CATEGORIES, SUPPLY_CATEGORIES, useInventoryItem, useInventoryMove, useSaveInventoryItem,
} from '@/features/inventory/hooks/use-inventory'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

const NONE = '__none__'
// Stored lowercase (the database only accepts these values); shown capitalised.
const CONDITIONS = ['new', 'good', 'fair', 'poor']
const cap = (c: string) => c.charAt(0).toUpperCase() + c.slice(1)

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : 'space-y-1.5'}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

/** Add or edit an asset (laptop, printer, generator…) or a supply line
 * (paper, toner…). Full page — no pop-ups. */
export function InventoryItemFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: existing, isLoading } = useInventoryItem(id)
  const { data: branches = [] } = useBranches(activeOrgId)
  const save = useSaveInventoryItem(activeOrgId)
  const move = useInventoryMove()
  const kind: 'asset' | 'supply' = existing?.kind ?? (params.get('kind') === 'supply' ? 'supply' : 'asset')
  const isAsset = kind === 'asset'

  const [f, setF] = React.useState({
    name: '', category: NONE, branch: NONE, serial: '', description: '', unit: '', reorder: '', unitCost: '', opening: '',
    purchaseDate: '', purchaseCost: '', supplier: '', warranty: '', condition: 'good', location: '', notes: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  React.useEffect(() => {
    if (!existing) return
    setF({
      name: existing.name, category: existing.category ?? NONE, branch: existing.branch_id ?? NONE, serial: existing.serial_no ?? '',
      description: existing.description ?? '', unit: existing.unit ?? '', reorder: existing.reorder_level?.toString() ?? '',
      unitCost: existing.unit_cost?.toString() ?? '', opening: '', purchaseDate: existing.purchase_date ?? '',
      purchaseCost: existing.purchase_cost?.toString() ?? '', supplier: existing.supplier ?? '', warranty: existing.warranty_until ?? '',
      condition: (existing.condition ?? 'good').toLowerCase(), location: existing.location ?? '', notes: existing.notes ?? '',
    })
  }, [existing])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) { toast.error('Give the item a name'); return }
    const row = {
      name: f.name.trim(), category: f.category === NONE ? null : f.category, branch_id: f.branch === NONE ? null : f.branch,
      description: f.description.trim() || null, location: f.location.trim() || null, notes: f.notes.trim() || null,
      ...(isAsset
        ? { serial_no: f.serial.trim() || null, purchase_date: f.purchaseDate || null, purchase_cost: num(f.purchaseCost),
            supplier: f.supplier.trim() || null, warranty_until: f.warranty || null, condition: f.condition }
        : { unit: f.unit.trim() || null, reorder_level: num(f.reorder), unit_cost: num(f.unitCost) }),
    }
    try {
      const savedId = await save.mutateAsync({ id, kind, ...row })
      const opening = num(f.opening)
      if (!id && !isAsset && opening && opening > 0) {
        await move.mutateAsync({ item: savedId, kind: 'received', quantity: opening, note: 'Opening stock', unitCost: num(f.unitCost) })
      }
      toast.success(id ? 'Saved' : isAsset ? 'Asset added' : 'Supply added')
      navigate(`/hr/inventory/${savedId}`, { replace: true })
    } catch (err) { toast.error('Could not save', { description: errorMessage(err) }) }
  }

  if (id && isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
      <PageHeader
        title={id ? `Edit ${existing?.name ?? 'item'}` : isAsset ? 'Add an asset' : 'Add a supply'}
        description={isAsset
          ? 'Something the firm owns and gives to one person or keeps in one place — it gets a tag number (AST-0001) automatically.'
          : 'Something the firm keeps in stock and hands out — paper, toner, files, court forms.'}
      />
      <form onSubmit={submit}>
        <Card className="space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <Input autoFocus value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder={isAsset ? 'e.g. Dell Latitude 5440 laptop' : 'e.g. A4 paper (ream)'} />
            </Field>
            <Field label="Category">
              <Select value={f.category} onValueChange={set('category')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {(isAsset ? ASSET_CATEGORIES : SUPPLY_CATEGORIES).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Branch" hint="Leave as firm-wide if it isn't tied to one office.">
              <Select value={f.branch} onValueChange={set('branch')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Firm-wide</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {isAsset ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Serial number"><Input value={f.serial} onChange={(e) => set('serial')(e.target.value)} /></Field>
              <Field label="Condition">
                <Select value={f.condition} onValueChange={set('condition')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{cap(c)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Purchase date"><Input type="date" value={f.purchaseDate} onChange={(e) => set('purchaseDate')(e.target.value)} /></Field>
              <Field label="Purchase cost"><Input type="number" min={0} step="0.01" value={f.purchaseCost} onChange={(e) => set('purchaseCost')(e.target.value)} /></Field>
              <Field label="Supplier"><Input value={f.supplier} onChange={(e) => set('supplier')(e.target.value)} /></Field>
              <Field label="Warranty until"><Input type="date" value={f.warranty} onChange={(e) => set('warranty')(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unit" hint="How it is counted — ream, box, cartridge, piece."><Input value={f.unit} onChange={(e) => set('unit')(e.target.value)} placeholder="ream" /></Field>
              <Field label="Reorder when stock reaches" hint="Inventory managers are notified at or below this."><Input type="number" min={0} value={f.reorder} onChange={(e) => set('reorder')(e.target.value)} /></Field>
              <Field label="Unit cost"><Input type="number" min={0} step="0.01" value={f.unitCost} onChange={(e) => set('unitCost')(e.target.value)} /></Field>
              {!id && <Field label="Opening stock" hint="How many you have right now."><Input type="number" min={0} value={f.opening} onChange={(e) => set('opening')(e.target.value)} /></Field>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" hint="e.g. Store room, 2nd floor"><Input value={f.location} onChange={(e) => set('location')(e.target.value)} /></Field>
            <Field label="Description"><Input value={f.description} onChange={(e) => set('description')(e.target.value)} /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea rows={3} value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button type="submit" loading={save.isPending || move.isPending}>{id ? 'Save changes' : isAsset ? 'Add asset' : 'Add supply'}</Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
