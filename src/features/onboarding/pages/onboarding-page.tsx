import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
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

type Step = 'firm' | 'plan' | 'welcome'
const STEP_INDEX: Record<Step, number> = { firm: 0, plan: 1, welcome: 2 }
const TOTAL_STEPS = 3

const STEP_COPY: Record<Step, { label: string; description: string }> = {
  firm: { label: 'Organisation Details', description: 'Tell us about your firm' },
  plan: { label: 'Choose Your Plan', description: 'No payment required to start a trial' },
  welcome: { label: "You're All Set", description: 'Your workspace is ready' },
}

const REDIRECT_SECONDS = 4

/**
 * Trial registration doesn't drop the new admin straight into the app —
 * it confirms the account/firm were created and sends them to sign in
 * properly with the credentials they just set, auto-redirecting after a
 * few seconds (or immediately via the button).
 */
function WelcomeStep({ firstName, onDone }: { firstName: string; onDone: () => void }) {
  const [seconds, setSeconds] = React.useState(REDIRECT_SECONDS)

  React.useEffect(() => {
    if (seconds <= 0) {
      onDone()
      return
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center py-4 text-center"
    >
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 14 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/12 text-primary"
      >
        <PartyPopper className="h-8 w-8" />
      </motion.span>
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 font-display text-2xl font-semibold"
      >
        Welcome to {APP.product}, {firstName}!
      </motion.h2>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-2 max-w-sm text-sm text-muted-foreground"
      >
        You're registered — your account and firm workspace are ready. Sign in with your email and
        password to get started.
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 w-full space-y-3"
      >
        <Button size="lg" className="w-full" onClick={onDone}>
          Go to sign in
        </Button>
        <p className="text-xs text-muted-foreground">Redirecting automatically in {seconds}s…</p>
      </motion.div>
    </motion.div>
  )
}

/**
 * The self-service org-creation wizard, reached at /onboarding by any
 * authenticated user with no active membership yet (see route-guards
 * and no-organization-state.tsx). "Account" is already done by the time
 * anyone lands here — see /auth/register.
 */
export function OnboardingPage() {
  const { profile, signOut } = useAuth()
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
      // Deliberately doesn't stay signed in — the trial account/firm exist
      // now, but the flow sends them to a fresh sign-in instead of
      // continuing straight into the workspace.
      setStep('welcome')
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
      // Leaves the SPA entirely (Paystack's hosted checkout), then returns
      // to /billing/callback — the org already exists on its normal trial
      // regardless, so an abandoned checkout never strands anyone.
      await checkout.mutateAsync({ organizationId: (org as { id: string }).id, planId })
    } catch (err) {
      toast.error('Could not start checkout', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
      setPendingAction(null)
    }
  }

  const goToSignIn = async () => {
    await signOut()
    navigate('/auth/login', { replace: true })
  }

  return (
    <GetStartedShell
      title="Set Up Your Workspace"
      stepLabel={STEP_COPY[step].label}
      stepDescription={STEP_COPY[step].description}
      step={STEP_INDEX[step]}
      totalSteps={TOTAL_STEPS}
      onBack={step === 'plan' ? { onClick: () => setStep('firm') } : undefined}
      maxWidthClassName={step === 'plan' ? 'max-w-5xl' : 'max-w-lg'}
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

      {step === 'welcome' && (
        <WelcomeStep firstName={profile?.full_name?.split(' ')[0] ?? 'there'} onDone={goToSignIn} />
      )}
    </GetStartedShell>
  )
}
