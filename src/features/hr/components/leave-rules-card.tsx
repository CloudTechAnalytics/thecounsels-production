import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useBranches } from '@/features/branches/hooks/use-branches'
import { supabase } from '@/shared/lib/supabase'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'

const DAYS = [{ n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' }, { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 7, l: 'Sun' }]
const ALL = '__all__'

/** The firm's working week and public holidays — leave is charged in
 * working days, so weekends and holidays aren't taken off anyone's balance. */
export function LeaveRulesCard() {
  const { activeOrgId } = useAuth()
  const qc = useQueryClient()
  const { data: branches = [] } = useBranches(activeOrgId)
  const year = new Date().getFullYear()
  const { data: settings } = useQuery({
    queryKey: ['hr', 'leave-settings', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: async () => {
      const { data, error } = await supabase.from('leave_settings').select('*').eq('organization_id', activeOrgId!).maybeSingle()
      if (error) throw error
      return data
    },
  })
  const { data: holidays = [] } = useQuery({
    queryKey: ['hr', 'holidays', activeOrgId],
    enabled: Boolean(activeOrgId),
    queryFn: async () => {
      const { data, error } = await supabase.from('public_holidays').select('*').eq('organization_id', activeOrgId!)
        .gte('holiday_date', `${year - 1}-12-01`).order('holiday_date')
      if (error) throw error
      return data ?? []
    },
  })
  const working = (settings?.working_days ?? [1, 2, 3, 4, 5]) as number[]
  const invalidate = () => qc.invalidateQueries({ queryKey: ['hr'] })

  const saveDays = useMutation({
    mutationFn: async (days: number[]) => {
      const { error } = await supabase.from('leave_settings').upsert({ organization_id: activeOrgId!, working_days: days, updated_at: new Date().toISOString() })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
  const toggleDay = (n: number) => {
    const next = working.includes(n) ? working.filter((d) => d !== n) : [...working, n].sort()
    if (next.length === 0) { toast.error('Keep at least one working day'); return }
    saveDays.mutate(next, { onError: (e) => toast.error('Could not save', { description: errorMessage(e) }) })
  }

  const [date, setDate] = React.useState('')
  const [name, setName] = React.useState('')
  const [branch, setBranch] = React.useState(ALL)
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('public_holidays').insert({ organization_id: activeOrgId!, holiday_date: date, name: name.trim(), branch_id: branch === ALL ? null : branch })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); setDate(''); setName(''); toast.success('Holiday added') },
    onError: (e) => toast.error('Could not add', { description: errorMessage(e) }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('public_holidays').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return (
    <Card className="space-y-5 p-5">
      <div>
        <p className="flex items-center gap-2 font-display text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Working week & public holidays</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Leave is charged in working days — days off and public holidays below aren’t taken from anyone’s balance (unless a leave type counts calendar days).</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d) => (
          <button key={d.n} type="button" onClick={() => toggleDay(d.n)} disabled={saveDays.isPending}
            className={cn('w-14 rounded-md border py-1.5 text-sm font-medium transition-colors',
              working.includes(d.n) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/50')}>
            {d.l}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public holidays</p>
        {holidays.length === 0 ? <p className="text-sm text-muted-foreground">None added yet. Add your country’s public holidays for the year.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span><span className="tabular-nums text-muted-foreground">{format(new Date(h.holiday_date + 'T00:00:00'), 'EEE d MMM yyyy')}</span> · {h.name}
                  {h.branch_id && <span className="text-xs text-muted-foreground"> · {branches.find((b) => b.id === h.branch_id)?.name ?? 'one branch'} only</span>}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate(h.id)} title="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input className="min-w-40 flex-1" placeholder="e.g. Independence Day" value={name} onChange={(e) => setName(e.target.value)} />
          {branches.length > 1 && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Whole firm</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} only</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" disabled={!date || !name.trim()} loading={add.isPending} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Add</Button>
        </div>
      </div>
    </Card>
  )
}
