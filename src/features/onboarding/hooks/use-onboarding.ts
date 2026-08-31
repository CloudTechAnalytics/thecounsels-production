import { useMutation, useQuery } from '@tanstack/react-query'
import { onboardingService } from '@/features/onboarding/services/onboarding.service'
import type { FirmSetupValues } from '@/features/onboarding/schemas'

export function useRegistrationSettings() {
  return useQuery({
    queryKey: ['registration-settings'],
    queryFn: () => onboardingService.getRegistrationSettings(),
  })
}

export function useSelectablePlans() {
  return useQuery({
    queryKey: ['selectable-plans'],
    queryFn: async () => {
      const plans = await onboardingService.getSelectablePlans()
      // A genuinely empty plan catalog isn't a real configuration this app
      // ships with — an empty result immediately after landing here (fresh
      // sign-up -> verify -> sign-in -> onboarding, all within seconds) is
      // far more likely to be the same PostgREST JWT eventual-consistency
      // gap documented by isTransientAuthError in auth-provider.tsx: the
      // request went out before the just-issued session was fully attached,
      // got treated as anon, and RLS silently returned zero rows instead of
      // an error. Throwing here lets the retry below recover automatically
      // instead of the plan step permanently showing "Trial only".
      if (plans.length === 0) throw new Error('EMPTY_PLANS_RETRY')
      return plans
    },
    retry: (failureCount, error) => failureCount < 2 && error instanceof Error && error.message === 'EMPTY_PLANS_RETRY',
    retryDelay: 600,
    // Never serve a stale empty/failed result across a whole onboarding
    // session — always fetch fresh when the plan step is (re)entered.
    refetchOnMount: 'always',
  })
}

export function useRegisterOrganization() {
  return useMutation({
    mutationFn: ({ values, planId, currency }: { values: FirmSetupValues; planId: string; currency?: string }) =>
      onboardingService.registerOrganization(values, planId, currency),
  })
}

export function useOnboardingChecklist(organizationId: string | null) {
  return useQuery({
    queryKey: ['onboarding-checklist', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => onboardingService.getChecklistStatus(organizationId!),
  })
}
