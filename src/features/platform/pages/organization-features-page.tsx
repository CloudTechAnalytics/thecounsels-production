import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Check, Minus, SlidersHorizontal } from 'lucide-react'
import { usePlatformOrganizations } from '@/features/platform/hooks/use-platform'
import { PLAN_FEATURES } from '@/features/platform/types'
import { ALL_PLAN_FEATURES, planHasFeature, type PlanFeatureKey } from '@/features/administration/lib/plan-features'
import { supabase } from '@/shared/lib/supabase'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { titleCase } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

type Override = { organization_id: string; feature: string; enabled: boolean; note: string | null; set_at: string }
type Choice = 'default' | 'on' | 'off'

const GROUPS: { title: string; keys: PlanFeatureKey[] }[] = [
  { title: 'Practice', keys: ['ai_summarization', 'messaging', 'whatsapp_reminders', 'appointments'] },
  { title: 'HR & Finance — basic', keys: ['hr_module'] },
  { title: 'HR & Finance — Business modules', keys: ['circulars', 'surveys', 'fund_requests', 'payroll', 'inventory', 'power_management', 'appraisals'] },
]
const labelOf = (k: string) => PLAN_FEATURES.find((f) => f.key === k)?.label ?? k

/** Every firm's overrides — used here and for the "custom" badge on the organisations list. */
export function useAllFeatureOverrides() {
  return useQuery({
    queryKey: ['platform', 'feature-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organization_feature_overrides').select('organization_id, feature, enabled, note, set_at')
      if (error) throw error
      return (data ?? []) as Override[]
    },
  })
}

function useSetFeature() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { org: string; feature: string; enabled: boolean | null; note: string }) => {
      const { error } = await supabase.rpc('set_org_feature', { p_org: v.org, p_feature: v.feature, p_enabled: v.enabled, p_note: v.note || null })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform', 'feature-overrides'] })
      qc.invalidateQueries({ queryKey: ['administration', 'feature-overrides'] })
    },
  })
}

function Segmented({ value, onChange, disabled }: { value: Choice; onChange: (c: Choice) => void; disabled?: boolean }) {
  const opts: { v: Choice; label: string }[] = [{ v: 'default', label: 'Plan default' }, { v: 'on', label: 'On' }, { v: 'off', label: 'Off' }]
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {opts.map((o) => (
        <button key={o.v} type="button" disabled={disabled} onClick={() => o.v !== value && onChange(o.v)}
          className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
            value === o.v
              ? o.v === 'on' ? 'bg-success text-success-foreground' : o.v === 'off' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Platform admin: switch any feature on or off for one firm, whatever its plan. */
export function OrganizationFeaturesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: orgs = [], isLoading } = usePlatformOrganizations()
  const { data: overrides = [] } = useAllFeatureOverrides()
  const setFeature = useSetFeature()
  const [note, setNote] = React.useState('')
  const [busyKey, setBusyKey] = React.useState<string | null>(null)

  if (isLoading) return <Skeleton className="h-96 w-full" />
  const org = orgs.find((o) => o.id === id)
  if (!org) return <Card className="p-10 text-center text-muted-foreground">Organization not found.</Card>

  const planFeatures = org.subscription?.plan?.features
  const planName = org.subscription?.plan?.name ?? titleCase(org.plan)
  const mine = overrides.filter((o) => o.organization_id === org.id)
  const overrideOf = (k: string) => mine.find((o) => o.feature === k)
  const custom = mine.length

  const change = (k: PlanFeatureKey, c: Choice) => {
    setBusyKey(k)
    setFeature.mutate({ org: org.id, feature: k, enabled: c === 'default' ? null : c === 'on', note }, {
      onSuccess: () => toast.success(`${labelOf(k)}: ${c === 'default' ? `back to ${planName} plan default` : c === 'on' ? 'turned on' : 'turned off'} for ${org.name}`),
      onError: (e) => toast.error('Could not change the feature', { description: errorMessage(e) }),
      onSettled: () => setBusyKey(null),
    })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate('/platform/organizations')}><ArrowLeft className="h-4 w-4" /> Organizations</Button>
      <PageHeader
        title={`${org.name} · Features`}
        description={`On the ${planName} plan${custom ? ` · ${custom} custom setting${custom === 1 ? '' : 's'}` : ''}. “Plan default” follows the plan; On or Off applies to this firm only, survives plan changes, and is enforced on the server too.`}
      />

      <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Reason for changes (optional, saved in the audit log)</span>
        <Input className="max-w-sm flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Firm asked to switch off AI" />
      </Card>

      <div className="space-y-5">
        {GROUPS.map((g) => (
          <Card key={g.title} className="overflow-hidden">
            <p className="border-b border-border bg-muted/30 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</p>
            <ul className="divide-y divide-border">
              {g.keys.filter((k) => ALL_PLAN_FEATURES.includes(k)).map((k) => {
                const fromPlan = planHasFeature(planFeatures, k)
                const o = overrideOf(k)
                const choice: Choice = o ? (o.enabled ? 'on' : 'off') : 'default'
                const effective = o ? o.enabled : fromPlan
                return (
                  <li key={k} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        {labelOf(k)}
                        {o && <Badge variant="warning" className="font-normal">Custom</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {planName} plan: {fromPlan ? 'included' : 'not included'}
                        {o && ` · set ${format(new Date(o.set_at), 'd MMM yyyy')}${o.note ? ` — “${o.note}”` : ''}`}
                      </p>
                    </div>
                    <span className={cn('flex w-24 items-center gap-1 text-sm font-medium', effective ? 'text-success' : 'text-muted-foreground')}>
                      {effective ? <Check className="h-4 w-4" /> : <Minus className="h-4 w-4" />}{effective ? 'Active' : 'Inactive'}
                    </span>
                    <Segmented value={choice} disabled={setFeature.isPending && busyKey === k} onChange={(c) => change(k, c)} />
                  </li>
                )
              })}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Turning a feature off hides it for everyone in the firm and blocks new activity on the server; nothing they already created is deleted.
        Every change is recorded in Audit Logs.
      </p>
    </div>
  )
}
