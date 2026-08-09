import * as React from 'react'
import { Palette, SlidersHorizontal, Flag, Mail, Wrench, Loader2, Rocket } from 'lucide-react'
import {
  usePlatformSettings,
  useUpdatePlatformSettings,
  useRegistrationSettingsAdmin,
  useUpdateRegistrationSettings,
} from '@/features/platform/hooks/use-platform'
import { PageHeader } from '@/shared/components/page-header'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

const FEATURE_FLAGS: { key: string; label: string; hint: string }[] = [
  { key: 'ai_insights', label: 'AI insights', hint: 'Predictive analytics on firm dashboards' },
  { key: 'trust_accounts', label: 'Trust accounts', hint: 'Client retainer / trust ledgers in billing' },
  { key: 'sso', label: 'SSO', hint: 'Single sign-on for enterprise firms' },
  { key: 'api_access', label: 'API access', hint: 'Programmatic API for firms' },
  { key: 'document_ocr', label: 'Document OCR', hint: 'Full-text search over uploaded documents' },
]

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (b: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-muted')}
      >
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Palette; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
      {children}
    </Card>
  )
}

/**
 * The one global knob behind /onboarding's free-trial offer: whether a
 * trial is offered at all, and its default length. Which plan a registering
 * firm gets is now their own choice on the onboarding plan step (see
 * useSelectablePlans/register_organization's p_plan_id) — each plan's own
 * price and trial_duration_days (Platform Console → Plans) drive what's
 * shown, so there's no longer a single "trial plan"/"future price" to
 * configure here. Self-contained (own load/save) since it reads a
 * different table than the rest of this page's single big platform_settings form.
 */
function RegistrationSettingsSection() {
  const { data, isLoading } = useRegistrationSettingsAdmin()
  const update = useUpdateRegistrationSettings()
  const [form, setForm] = React.useState({ trial_enabled: true, trial_duration_days: 30 })

  React.useEffect(() => {
    if (!data) return
    setForm({ trial_enabled: data.trial_enabled, trial_duration_days: data.trial_duration_days })
  }, [data])

  const save = async () => {
    try {
      await update.mutateAsync({
        trial_enabled: form.trial_enabled,
        trial_duration_days: Number(form.trial_duration_days) || 30,
      })
      toast.success('Registration settings saved')
    } catch (err) {
      toast.error('Could not save', { description: err instanceof Error ? err.message : undefined })
    }
  }

  if (isLoading) return <Section icon={Rocket} title="Self-service registration"><Skeleton className="h-24 w-full" /></Section>

  return (
    <Section icon={Rocket} title="Self-service registration">
      <div className="space-y-3">
        <Toggle
          checked={form.trial_enabled}
          onChange={(b) => setForm((f) => ({ ...f, trial_enabled: b }))}
          label="Trial enabled"
          hint="Whether new self-registered firms can start a free trial at all"
        />
        <div className="max-w-xs space-y-1.5">
          <Label>Trial length (days)</Label>
          <Input
            type="number"
            value={form.trial_duration_days}
            onChange={(e) => setForm((f) => ({ ...f, trial_duration_days: Number(e.target.value) }))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Per-plan pricing and trial length live on each plan (Platform Console → Plans) — this is
          just the global default and the on/off switch for offering a trial at all.
        </p>
        <div className="flex justify-end">
          <Button onClick={save} loading={update.isPending}>Save registration settings</Button>
        </div>
      </div>
    </Section>
  )
}

export function PlatformSettingsPage() {
  const { data, isLoading } = usePlatformSettings()
  const update = useUpdatePlatformSettings()

  const [form, setForm] = React.useState({
    product_name: '', support_email: '', primary_color: '#B38A3E', global_notice: '',
    allow_org_creation: true, default_trial_days: 14, maintenance_mode: false, maintenance_message: '',
  })
  const [flags, setFlags] = React.useState<Record<string, boolean>>({})
  const [smtp, setSmtp] = React.useState({ host: '', port: '', from_email: '', from_name: '' })

  React.useEffect(() => {
    if (!data) return
    setForm({
      product_name: data.product_name ?? '', support_email: data.support_email ?? '', primary_color: data.primary_color ?? '#B38A3E',
      global_notice: data.global_notice ?? '', allow_org_creation: data.allow_org_creation, default_trial_days: data.default_trial_days,
      maintenance_mode: data.maintenance_mode, maintenance_message: data.maintenance_message ?? '',
    })
    setFlags((data.feature_flags as Record<string, boolean>) ?? {})
    const s = (data.smtp as Record<string, string>) ?? {}
    setSmtp({ host: s.host ?? '', port: s.port ?? '', from_email: s.from_email ?? '', from_name: s.from_name ?? '' })
  }, [data])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    try {
      await update.mutateAsync({
        product_name: form.product_name.trim() || 'CloudTech Legal Suite',
        support_email: form.support_email || null,
        primary_color: form.primary_color,
        global_notice: form.global_notice || null,
        allow_org_creation: form.allow_org_creation,
        default_trial_days: Number(form.default_trial_days) || 14,
        maintenance_mode: form.maintenance_mode,
        maintenance_message: form.maintenance_message || null,
        feature_flags: flags,
        smtp,
      })
      toast.success('Settings saved')
    } catch (err) {
      toast.error('Could not save settings', { description: err instanceof Error ? err.message : undefined })
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Platform Settings" description="Global configuration." />
        <div className="space-y-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description="Global configuration for the CloudTech platform."
        actions={<Button onClick={save} loading={update.isPending}>{update.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save changes</Button>}
      />

      <div className="space-y-5">
        <Section icon={Palette} title="Branding">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Product name</Label><Input value={form.product_name} onChange={(e) => set('product_name', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Support email</Label><Input type="email" value={form.support_email} onChange={(e) => set('support_email', e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Primary color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent" />
                <Input value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Global notice (shown to all users)</Label><Input value={form.global_notice} onChange={(e) => set('global_notice', e.target.value)} placeholder="e.g. Scheduled maintenance Sunday 02:00 UTC" /></div>
          </div>
        </Section>

        <Section icon={SlidersHorizontal} title="Access & trials">
          <div className="space-y-3">
            <Toggle checked={form.allow_org_creation} onChange={(b) => set('allow_org_creation', b)} label="Allow new organizations" hint="Platform admins can provision new firms" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Default trial length (days)</Label><Input type="number" value={form.default_trial_days} onChange={(e) => set('default_trial_days', Number(e.target.value))} /></div>
            </div>
          </div>
        </Section>

        <RegistrationSettingsSection />

        <Section icon={Flag} title="Feature flags">
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURE_FLAGS.map((f) => (
              <Toggle key={f.key} label={f.label} hint={f.hint} checked={Boolean(flags[f.key])} onChange={(b) => setFlags((prev) => ({ ...prev, [f.key]: b }))} />
            ))}
          </div>
        </Section>

        <Section icon={Mail} title="Email / SMTP">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>SMTP host</Label><Input value={smtp.host} onChange={(e) => setSmtp((s) => ({ ...s, host: e.target.value }))} placeholder="smtp.provider.com" /></div>
            <div className="space-y-1.5"><Label>Port</Label><Input value={smtp.port} onChange={(e) => setSmtp((s) => ({ ...s, port: e.target.value }))} placeholder="587" /></div>
            <div className="space-y-1.5"><Label>From email</Label><Input value={smtp.from_email} onChange={(e) => setSmtp((s) => ({ ...s, from_email: e.target.value }))} placeholder="noreply@cloudtech.legal" /></div>
            <div className="space-y-1.5"><Label>From name</Label><Input value={smtp.from_name} onChange={(e) => setSmtp((s) => ({ ...s, from_name: e.target.value }))} placeholder="CloudTech Legal Suite" /></div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Stored for reference. Wiring transactional email requires an Edge Function with these credentials.</p>
        </Section>

        <Section icon={Wrench} title="Maintenance">
          <div className="space-y-3">
            <Toggle checked={form.maintenance_mode} onChange={(b) => set('maintenance_mode', b)} label="Maintenance mode" hint="Show a maintenance notice to all users" />
            <div className="space-y-1.5"><Label>Maintenance message</Label><Textarea rows={2} value={form.maintenance_message} onChange={(e) => set('maintenance_message', e.target.value)} placeholder="We're performing scheduled maintenance and will be back shortly." /></div>
          </div>
        </Section>
      </div>
    </div>
  )
}
