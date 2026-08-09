import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { PartyPopper } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { FirmSetupStep } from '@/features/onboarding/components/firm-setup-step'
import { PlanStep } from '@/features/onboarding/components/plan-step'
import { useRegisterOrganization } from '@/features/onboarding/hooks/use-onboarding'
import { useStartCheckout } from '@/features/subscription-billing/hooks/use-paystack'
import type { FirmSetupValues } from '@/features/onboarding/schemas'
import { GetStartedShell } from '@/shared/components/get-started-shell'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import { APP } from '@/shared/config/env'

type Step = 'firm' | 'plan' | 'done'
const STEP_INDEX: Record<Step, number> = { firm: 0, plan: 1, done: 2 }
const TOTAL_STEPS = 3

const STEP_COPY: Record<Step, { label: string; description: string }> = {
  firm: { label: 'Organisation Details', description: 'Tell us about your firm' },
  plan: { label: 'Choose Your Plan', description: 'No payment required to start a trial' },
  done: { label: "You're All Set", description: 'Your workspace is ready' },
}

/**
 * The self-service org-creation wizard, reached at /onboarding by any
 * authenticated user with no active membership yet (see route-guards
 * and no-organization-state.tsx). "Account" is already done by the time
 * anyone lands here — see /auth/register.
 */
export function OnboardingPage() {
  const { profile, refresh } = useAuth()
  const navigate = useNavigate()
  const register = useRegisterOrganization()
  const checkout = useStartCheckout()
  const [step, setStep] = React.useState<Step>('firm')
  const [firmValues, setFirmValues] = React.useState<FirmSetupValues | null>(null)
  const [pendingAction, setPendingAction] = React.useState<'trial' | 'subscribe' | null>(null)

  const startTrial = async (planId: string) => {
    if (!firmValues) return
    setPendingAction('trial')
    try {
      await register.mutateAsync({ values: firmValues, planId })
      await refresh()
      setStep('done')
    } catch (err) {
      toast.error('Could not set up your firm', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const subscribeNow = async (planId: string) => {
    if (!firmValues) return
    setPendingAction('subscribe')
    try {
      const org = await register.mutateAsync({ values: firmValues, planId })
      await refresh()
      // Leaves the SPA entirely (Paystack's hosted checkout), then returns
      // to /billing/callback — the org already exists on its normal 30-day
      // trial regardless, so an abandoned checkout never strands anyone.
      await checkout.mutateAsync({ organizationId: (org as { id: string }).id, planId })
    } catch (err) {
      toast.error('Could not start checkout', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
      setPendingAction(null)
    }
  }

  return (
    <GetStartedShell
      title="Set Up Your Workspace"
      stepLabel={STEP_COPY[step].label}
      stepDescription={STEP_COPY[step].description}
      step={STEP_INDEX[step]}
      totalSteps={TOTAL_STEPS}
      onBack={step === 'plan' ? { onClick: () => setStep('firm') } : undefined}
    >
      {step === 'firm' && (
        <FirmSetupStep
          defaultValues={firmValues ?? undefined}
          onNext={(values) => {
            setFirmValues(values)
            setStep('plan')
          }}
        />
      )}

      {step === 'plan' && (
        <PlanStep
          onStartTrial={startTrial}
          onSubscribeNow={subscribeNow}
          trialLoading={pendingAction === 'trial'}
          subscribeLoading={pendingAction === 'subscribe'}
        />
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <PartyPopper className="h-8 w-8" />
          </span>
          <h2 className="mt-6 font-display text-2xl font-semibold">
            Welcome to {APP.product}, {profile?.full_name?.split(' ')[0] ?? 'there'}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your firm's workspace is ready. You're set up as Managing Partner — invite your team, add
            your first client, and open your first matter whenever you're ready.
          </p>
          <Button size="lg" className="mt-8 w-full" onClick={() => navigate('/', { replace: true })}>
            Enter your workspace
          </Button>
        </div>
      )}
    </GetStartedShell>
  )
}
