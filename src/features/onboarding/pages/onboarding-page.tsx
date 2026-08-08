import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, PartyPopper, Scale } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { FirmSetupStep } from '@/features/onboarding/components/firm-setup-step'
import { PlanStep } from '@/features/onboarding/components/plan-step'
import { useRegisterOrganization } from '@/features/onboarding/hooks/use-onboarding'
import type { FirmSetupValues } from '@/features/onboarding/schemas'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'

type Step = 'firm' | 'plan' | 'done'
const STEPS: { key: Step; label: string }[] = [
  { key: 'firm', label: 'Firm' },
  { key: 'plan', label: 'Plan' },
  { key: 'done', label: 'Done' },
]

/**
 * The self-service org-creation wizard, reached at /onboarding by any
 * authenticated user with no active membership yet (see route-guards
 * and no-organization-state.tsx). "Account" is already done by the time
 * anyone lands here — see /auth/register — so the visible progress starts
 * at Firm, matching §23's 4-step indicator (Account is shown pre-checked).
 */
export function OnboardingPage() {
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const register = useRegisterOrganization()
  const [step, setStep] = React.useState<Step>('firm')
  const [firmValues, setFirmValues] = React.useState<FirmSetupValues | null>(null)

  const startTrial = async () => {
    if (!firmValues) return
    try {
      await register.mutateAsync(firmValues)
      await refresh()
      setStep('done')
    } catch (err) {
      toast.error('Could not set up your firm', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/70 px-6 py-5">
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="h-5 w-5" />
          </span>
          <p className="font-display text-lg font-semibold">{APP.product}</p>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-6 py-10">
        {/* Progress indicator: Account -> Firm -> Plan -> Done */}
        <div className="mb-10 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5 text-success">
            <Check className="h-3.5 w-3.5" /> Account
          </span>
          {STEPS.map((s, i) => {
            const stepIdx = STEPS.findIndex((x) => x.key === step)
            const done = i < stepIdx || step === 'done'
            const current = s.key === step
            return (
              <React.Fragment key={s.key}>
                <span className="h-px w-6 bg-border" />
                <span className={cn('flex items-center gap-1.5', (done || current) && 'text-foreground', current && 'font-semibold text-primary')}>
                  {done && s.key !== step ? <Check className="h-3.5 w-3.5 text-success" /> : null}
                  {s.label}
                </span>
              </React.Fragment>
            )
          })}
        </div>

        {step === 'firm' && (
          <>
            <h1 className="font-display text-2xl font-semibold">Tell us about your firm</h1>
            <p className="mt-1 text-sm text-muted-foreground">Only a few things are required — you can fill in the rest later.</p>
            <div className="mt-8">
              <FirmSetupStep
                defaultValues={firmValues ?? undefined}
                onNext={(values) => {
                  setFirmValues(values)
                  setStep('plan')
                }}
              />
            </div>
          </>
        )}

        {step === 'plan' && (
          <>
            <h1 className="font-display text-2xl font-semibold">Start your free access</h1>
            <p className="mt-1 text-sm text-muted-foreground">No payment required — you're in full control of your workspace from day one.</p>
            <div className="mt-8">
              <PlanStep onStart={startTrial} loading={register.isPending} onBack={() => setStep('firm')} />
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center py-8 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <PartyPopper className="h-8 w-8" />
            </span>
            <h1 className="mt-6 font-display text-2xl font-semibold">
              Welcome to {APP.product}, {profile?.full_name?.split(' ')[0] ?? 'there'}
            </h1>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Your firm's workspace is ready. You're set up as Managing Partner — invite your team, add
              your first client, and open your first matter whenever you're ready.
            </p>
            <Button size="lg" className="mt-8" onClick={() => navigate('/', { replace: true })}>
              Enter your workspace
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
