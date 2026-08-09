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
    queryFn: () => onboardingService.getSelectablePlans(),
    staleTime: 5 * 60_000,
  })
}

export function useRegisterOrganization() {
  return useMutation({
    mutationFn: ({ values, planId }: { values: FirmSetupValues; planId: string }) =>
      onboardingService.registerOrganization(values, planId),
  })
}

export function useOnboardingChecklist(organizationId: string | null) {
  return useQuery({
    queryKey: ['onboarding-checklist', organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => onboardingService.getChecklistStatus(organizationId!),
  })
}
