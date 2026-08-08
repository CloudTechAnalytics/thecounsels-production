import { useMutation, useQuery } from '@tanstack/react-query'
import { onboardingService } from '@/features/onboarding/services/onboarding.service'
import type { FirmSetupValues } from '@/features/onboarding/schemas'

export function useRegistrationSettings() {
  return useQuery({
    queryKey: ['registration-settings'],
    queryFn: () => onboardingService.getRegistrationSettings(),
  })
}

export function useRegisterOrganization() {
  return useMutation({
    mutationFn: (values: FirmSetupValues) => onboardingService.registerOrganization(values),
  })
}
