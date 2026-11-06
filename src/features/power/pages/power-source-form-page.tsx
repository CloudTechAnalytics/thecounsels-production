import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { SOURCE_KIND_LABEL, useDeletePowerSource, usePowerSources, useSavePowerSource, type PowerSourceKind } from '@/features/power/hooks/use-power'
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
import { cn } from '@/shared/lib/utils'

const NONE = '__none__'

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const num = (v: string) => (v.trim() === '' ? null : Number(v))

/** Add or edit a grid meter, generator, solar or inverter system. */
export function PowerSourceFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { activeOrgId } = useAuth()
  const { data: sources = [], isLoading } = usePowerSources(activeOrgId)
  const { data: branches = [] } = useBranches(activeOrgId)
  const save = useSavePowerSource(activeOrgId)
  const del = useDeletePowerSource()
  const existing = id ? sources.find((s) => s.id === id) : undefined

  const [f, setF] = React.useState({
    kind: 'grid' as PowerSourceKind, name: '', branch: NONE, meter: '', capacity: '', fuel: 'diesel', tank: '', interval: '250',
    hourMeter: '', lastServiceOn: '', lastServiceHours: '', active: true, notes: '',
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))
  React.useEffect(() => {
    if (!existing) return
    setF({
      kind: existing.kind, name: existing.name, branch: existing.branch_id ?? NONE, meter: existing.meter_no ?? '', capacity: existing.capacity ?? '',
      fuel: existing.fuel_type ?? 'diesel', tank: existing.tank_litres?.toString() ?? '', interval: existing.service_interval_hours?.toString() ?? '',
      hourMeter: existing.hour_meter?.toString() ?? '', lastServiceOn: existing.last_service_on ?? '', lastServiceHours: existing.last_service_hours?.toString() ?? '',
      active: existing.active, notes: existing.notes ?? '',
    })
  }, [existing])
  const isGen = f.kind === 'generator'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.name.trim()) { toast.error('Give it a name, e.g. "Lagos office meter"'); return }
    try {
      await save.mutateAsync({
        id, kind: f.kind, name: f.name.trim(), branch_id: f.branch === NONE ? null : f.branch, meter_no: f.meter.trim() || null,
        capacity: f.capacity.trim() || null, active: f.active, notes: f.notes.trim() || null,
        ...(isGen ? {
          fuel_type: f.fuel as 'diesel' | 'petrol' | 'gas', tank_litres: num(f.tank), service_interval_hours: num(f.interval),
          hour_meter: num(f.hourMeter), last_service_on: f.lastServiceOn || null, last_service_hours: num(f.lastServiceHours),
        } : {}),
      })
      toast.success(id ? 'Saved' : 'Power source added')
      navigate('/hr/power', { replace: true })
    } catch (err) { toast.error('Could not save', { description: errorMessage(err) }) }
  }

  const remove = async () => {
    if (!existing || !window.confirm(`Delete ${existing.name} and everything logged against it? To keep its history, untick "In use" instead.`)) return
    try { await del.mutateAsync(existing.id); toast.success('Deleted'); navigate('/hr/power', { replace: true }) }
    catch (err) { toast.error('Could not delete', { description: errorMessage(err) }) }
  }

  if (id && isLoading) return <Skeleton className="h-96 w-full" />

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/hr/power')}><ArrowLeft className="h-4 w-4" /> Electricity & Power</Button>
      <PageHeader title={id ? `Edit ${existing?.name ?? 'source'}` : 'Add a power source'} description="A meter, generator, solar or inverter system at one of your offices." />
      <form onSubmit={submit}>
        <Card className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(SOURCE_KIND_LABEL) as PowerSourceKind[]).map((k) => (
              <button type="button" key={k} disabled={Boolean(id)} onClick={() => setF((s) => ({ ...s, kind: k }))}
                className={cn('rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
                  f.kind === k ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50', id && f.kind !== k && 'opacity-40')}>
                {SOURCE_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input autoFocus value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder={isGen ? 'e.g. Main 60kVA generator' : 'e.g. Lagos office prepaid meter'} /></Field>
            <Field label="Branch">
              <Select value={f.branch} onValueChange={set('branch')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Firm-wide</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={f.kind === 'grid' ? 'Meter number' : 'Serial / model'}><Input value={f.meter} onChange={(e) => set('meter')(e.target.value)} /></Field>
            <Field label="Capacity" hint={isGen ? 'e.g. 60 kVA' : f.kind === 'solar' ? 'e.g. 10 kW panels' : f.kind === 'inverter' ? 'e.g. 5 kVA, 4 batteries' : 'e.g. Band A tariff'}>
              <Input value={f.capacity} onChange={(e) => set('capacity')(e.target.value)} />
            </Field>
          </div>

          {isGen && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Fuel & servicing</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Fuel">
                  <Select value={f.fuel} onValueChange={set('fuel')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="diesel">Diesel</SelectItem><SelectItem value="petrol">Petrol</SelectItem><SelectItem value="gas">Gas</SelectItem></SelectContent>
                  </Select>
                </Field>
                <Field label="Tank size (litres)"><Input type="number" min={0} value={f.tank} onChange={(e) => set('tank')(e.target.value)} /></Field>
                <Field label="Service every (hours)" hint="Usually 250 hours."><Input type="number" min={1} value={f.interval} onChange={(e) => set('interval')(e.target.value)} /></Field>
                <Field label="Hour meter now"><Input type="number" min={0} step="0.1" value={f.hourMeter} onChange={(e) => set('hourMeter')(e.target.value)} /></Field>
                <Field label="Last serviced on"><Input type="date" value={f.lastServiceOn} onChange={(e) => set('lastServiceOn')(e.target.value)} /></Field>
                <Field label="Hour meter at last service"><Input type="number" min={0} step="0.1" value={f.lastServiceHours} onChange={(e) => set('lastServiceHours')(e.target.value)} /></Field>
              </div>
              <p className="text-xs text-muted-foreground">Facility managers are notified when it reaches 90% of its service interval.</p>
            </div>
          )}

          <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
          {id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.active} onChange={(e) => setF((s) => ({ ...s, active: e.target.checked }))} className="h-4 w-4 accent-[hsl(var(--primary))]" />
              In use (untick when it's sold or retired — its history is kept)
            </label>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            <div>{id && <Button type="button" variant="ghost" className="text-destructive" onClick={remove} loading={del.isPending}><Trash2 className="h-4 w-4" /> Delete</Button>}</div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => navigate('/hr/power')}>Cancel</Button>
              <Button type="submit" loading={save.isPending}>{id ? 'Save changes' : 'Add source'}</Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}
