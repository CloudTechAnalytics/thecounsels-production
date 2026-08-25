import * as React from 'react'
import { Check } from 'lucide-react'
import { useSavePlan } from '@/features/platform/hooks/use-platform'
import { PLAN_FEATURES } from '@/features/platform/types'
import type { Plan } from '@/shared/types/database.types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Separator } from '@/shared/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/components/ui/sonner'

type Draft = {
  name: string
  description: string
  price_monthly: string
  price_quarterly: string
  price_yearly: string
  max_users: string
  storage_gb: string
  support_level: string
  highlights: string
  features: Record<string, boolean>
}

function toDraft(plan?: Plan | null): Draft {
  return {
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    price_monthly: plan ? String(plan.price_monthly) : '',
    price_quarterly: plan?.price_quarterly != null ? String(plan.price_quarterly) : '',
    price_yearly: plan ? String(plan.price_yearly) : '',
    max_users: plan?.max_users != null ? String(plan.max_users) : '',
    storage_gb: plan ? String(plan.storage_gb) : '',
    support_level: plan?.support_level ?? 'Community',
    highlights: (plan?.highlights ?? []).join('\n'),
    features: (plan?.features as Record<string, boolean>) ?? {},
  }
}

export function PlanEditorDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan?: Plan | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const save = useSavePlan()
  const [draft, setDraft] = React.useState<Draft>(toDraft(plan))

  React.useEffect(() => {
    if (open) setDraft(toDraft(plan))
  }, [open, plan])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const toggleFeature = (key: string) =>
    setDraft((d) => ({ ...d, features: { ...d.features, [key]: !d.features[key] } }))

  const submit = async () => {
    if (!draft.name.trim()) {
      toast.error('Plan name is required')
      return
    }
    try {
      await save.mutateAsync({
        id: plan?.id,
        name: draft.name.trim(),
        description: draft.description || null,
        price_monthly: Number(draft.price_monthly) || 0,
        price_quarterly: draft.price_quarterly === '' ? undefined : Number(draft.price_quarterly) || 0,
        price_yearly: Number(draft.price_yearly) || 0,
        max_users: draft.max_users === '' ? null : Number(draft.max_users),
        storage_gb: Number(draft.storage_gb) || 0,
        support_level: draft.support_level,
        highlights: draft.highlights.split('\n').map((s) => s.trim()).filter(Boolean),
        features: draft.features,
      })
      toast.success(plan ? 'Plan updated' : 'Plan created')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save plan', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : 'Create a custom plan'}</DialogTitle>
          <DialogDescription>Define pricing, limits and included features.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Plan name</Label>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Professional" />
            </div>
            <div className="space-y-1.5">
              <Label>Support level</Label>
              <Input value={draft.support_level} onChange={(e) => set('support_level', e.target.value)} placeholder="Priority Email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="For growing firms" />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Monthly (₦)</Label>
              <Input type="number" value={draft.price_monthly} onChange={(e) => set('price_monthly', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quarterly (₦)</Label>
              <Input
                type="number"
                value={draft.price_quarterly}
                onChange={(e) => set('price_quarterly', e.target.value)}
                placeholder={draft.price_monthly ? String(Math.round(Number(draft.price_monthly) * 3 * 0.9)) : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Yearly (₦)</Label>
              <Input type="number" value={draft.price_yearly} onChange={(e) => set('price_yearly', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Max users</Label>
              <Input type="number" value={draft.max_users} onChange={(e) => set('max_users', e.target.value)} placeholder="∞" />
            </div>
            <div className="space-y-1.5">
              <Label>Storage (GB)</Label>
              <Input type="number" value={draft.storage_gb} onChange={(e) => set('storage_gb', e.target.value)} />
            </div>
          </div>

          <Separator />
          <div>
            <Label>Included features</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PLAN_FEATURES.map((f) => {
                const on = draft.features[f.key]
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => toggleFeature(f.key)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
                      on ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground',
                    )}
                  >
                    {f.label}
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', on ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                      {on && <Check className="h-3 w-3" />}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Highlights (one per line)</Label>
            <Textarea
              rows={4}
              value={draft.highlights}
              onChange={(e) => set('highlights', e.target.value)}
              placeholder={'Up to 15 users\n100 GB storage\nPriority support'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {plan ? 'Save changes' : 'Create plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
