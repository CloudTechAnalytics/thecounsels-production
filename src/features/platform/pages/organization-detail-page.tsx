import * as React from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeft, Check, Minus, SlidersHorizontal, Pencil, Users, CreditCard, ScrollText } from 'lucide-react'
import { useUpdateOrganization } from '@/features/platform/hooks/use-platform'
import { Label } from '@/shared/components/ui/label'
import type { OrgRow } from '@/features/platform/types'
import { SubscriptionStatusBadge, subscriptionStatus } from '@/features/platform/components/subscription-status-badge'
import { CYCLE_LABEL, monthlyEquivalent } from '@/shared/lib/billing-cycle'
import { usePlatformOrganizations } from '@/features/platform/hooks/use-platform'
import { PLAN_FEATURES } from '@/features/platform/types'
import { ALL_PLAN_FEATURES, planHasFeature, type PlanFeatureKey } from '@/features/administration/lib/plan-features'
import { supabase } from '@/shared/lib/supabase'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'
import { formatNaira, formatStorage, initialsOf, titleCase } from '@/shared/lib/format'
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value || '—'}</span>
    </div>
  )
}

/** The Firm card in edit mode — saves the firm's profile in place. */
function FirmEditor({ org, onDone }: { org: OrgRow; onDone: () => void }) {
  const update = useUpdateOrganization()
  const [f, setF] = React.useState({
    name: org.name ?? '', legal_name: org.legal_name ?? '', industry: org.industry ?? '',
    website: org.website ?? '', phone: org.phone ?? '', billing_email: org.billing_email ?? '',
  })
  const field = (k: keyof typeof f, label: string, type = 'text', placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={f[k]} placeholder={placeholder} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
    </div>
  )
  const save = async () => {
    if (!f.name.trim()) { toast.error('Name is required'); return }
    try {
      await update.mutateAsync({ id: org.id, patch: {
        name: f.name.trim(), legal_name: f.legal_name.trim() || null, industry: f.industry.trim() || null,
        website: f.website.trim() || null, phone: f.phone.trim() || null, billing_email: f.billing_email.trim() || null,
      } })
      toast.success('Organization updated')
      onDone()
    } catch (err) { toast.error('Could not update', { description: errorMessage(err) }) }
  }
  return (
    <div className="space-y-3">
      {field('name', 'Firm name')}
      {field('legal_name', 'Legal name')}
      {field('industry', 'Industry', 'text', 'e.g. Full Service Law Firm')}
      {field('website', 'Website', 'url', 'https://')}
      {field('phone', 'Phone', 'tel')}
      {field('billing_email', 'Billing email', 'email')}
      <p className="text-xs text-muted-foreground">The workspace link (/{org.slug}) can’t be changed.</p>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button size="sm" onClick={save} loading={update.isPending}>Save</Button>
      </div>
    </div>
  )
}

/** One firm in the Platform Console: its details, subscription and usage,
 * and the per-firm feature switches — a full page, not a pop-up. */
export function OrganizationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: orgs = [], isLoading } = usePlatformOrganizations()
  const { data: overrides = [] } = useAllFeatureOverrides()
  const setFeature = useSetFeature()
  const [note, setNote] = React.useState('')
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const editing = params.get('edit') === '1'
  const setEditing = (on: boolean) => setParams(on ? { edit: '1' } : {}, { replace: true })

  const wantsFeatures = window.location.pathname.endsWith('/features')
  React.useEffect(() => {
    if (wantsFeatures && !isLoading) document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [wantsFeatures, isLoading])

  if (isLoading) return <Skeleton className="h-96 w-full" />
  const org = orgs.find((o) => o.id === id)
  if (!org) return <Card className="p-10 text-center text-muted-foreground">Organization not found.</Card>

  const planFeatures = org.subscription?.plan?.features
  const planName = org.subscription?.plan?.name ?? titleCase(org.plan)
  const mine = overrides.filter((o) => o.organization_id === org.id)
  const overrideOf = (k: string) => mine.find((o) => o.feature === k)
  const custom = mine.length
  const sub = org.subscription

  const change = (k: PlanFeatureKey, c: Choice) => {
    setBusyKey(k)
    setFeature.mutate({ org: org.id, feature: k, enabled: c === 'default' ? null : c === 'on', note }, {
      onSuccess: () => toast.success(`${labelOf(k)}: ${c === 'default' ? `back to ${planName} plan default` : c === 'on' ? 'turned on' : 'turned off'} for ${org.name}`),
      onError: (e) => toast.error('Could not change the feature', { description: errorMessage(e) }),
      onSettled: () => setBusyKey(null),
    })
  }

  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => navigate('/platform/organizations')}><ArrowLeft className="h-4 w-4" /> Organizations</Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/12 text-lg font-semibold text-primary">
            {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : initialsOf(org.name, 'OR')}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">{org.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>/{org.slug}</span>
              <Badge variant="outline">{planName}</Badge>
              <SubscriptionStatusBadge org={org} />
              {custom > 0 && <Badge variant="warning" className="font-normal">{custom} custom feature{custom === 1 ? '' : 's'}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={editing ? 'default' : 'outline'} onClick={() => setEditing(!editing)}><Pencil className="h-4 w-4" /> {editing ? 'Editing…' : 'Edit'}</Button>
          <Button variant="outline" onClick={() => navigate('/platform/organization-users')}><Users className="h-4 w-4" /> Users</Button>
          <Button variant="outline" onClick={() => navigate('/platform/subscriptions')}><CreditCard className="h-4 w-4" /> Subscription</Button>
          <Button variant="outline" onClick={() => navigate('/platform/audit')}><ScrollText className="h-4 w-4" /> Audit logs</Button>
        </div>
      </div>

      {subscriptionStatus(org).locked && (
        <Card className="mb-5 border-destructive/40 bg-destructive/5 p-4 text-sm">
          <strong>{org.name}’s members can’t use the workspace right now</strong> — {subscriptionStatus(org).label.toLowerCase()}.
          {sub?.trial_ends_at && sub.status === 'expired' && ` Their trial ended on ${format(new Date(sub.trial_ends_at), 'd MMM yyyy')}.`} Change the subscription under Subscriptions to restore access.
        </Card>
      )}

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card className={cn('p-5', editing && 'border-primary/50 md:row-span-2')}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Firm</p>
          {editing ? <FirmEditor org={org} onDone={() => setEditing(false)} /> : <>
          <Row label="Industry" value={org.industry} />
          <Row label="Legal name" value={org.legal_name} />
          <Row label="Website" value={org.website} />
          <Row label="Phone" value={org.phone} />
          <Row label="Billing email" value={org.billing_email} />
          <Row label="Owner" value={org.owner?.full_name ?? org.owner?.email} />
          </>}
        </Card>
        <Card className="p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscription</p>
          <Row label="Plan" value={planName} />
          <Row label="Status" value={sub ? <span className="capitalize">{sub.status}</span> : '—'} />
          <Row label="Billing cycle" value={sub ? CYCLE_LABEL[sub.billing_cycle] : '—'} />
          <Row label="Monthly value" value={sub?.plan ? formatNaira(monthlyEquivalent(sub.billing_cycle, sub.plan)) : '—'} />
          <Row label="Seats" value={sub?.seats} />
          <Row label="Renewal" value={sub?.current_period_end ? format(new Date(sub.current_period_end), 'd MMM yyyy') : '—'} />
        </Card>
        <Card className="p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usage</p>
          <Row label="Users" value={org.member_count} />
          <Row label="Storage used" value={formatStorage(org.storage_used_bytes)} />
          <Row label="Storage limit" value={org.storage_limit_bytes ? formatStorage(org.storage_limit_bytes) : 'Not configured'} />
          <Row label="Created" value={format(new Date(org.created_at), 'd MMM yyyy')} />
          <Row label="Last login" value={org.last_login_at ? format(new Date(org.last_login_at), 'd MMM yyyy, HH:mm') : 'Never'} />
        </Card>
      </div>

      <div id="features" className="mb-3 scroll-mt-20">
        <h2 className="font-display text-xl font-semibold">Features</h2>
        <p className="text-sm text-muted-foreground">
          “Plan default” follows the {planName} plan. On or Off applies to this firm only, survives plan changes, and is enforced on the server too.
        </p>
      </div>

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
