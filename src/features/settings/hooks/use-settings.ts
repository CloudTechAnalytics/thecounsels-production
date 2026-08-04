import { useMutation } from '@tanstack/react-query'
import { settingsService } from '@/features/settings/services/settings.service'

export function useUpdateProfile(userId: string | null) {
  return useMutation({
    mutationFn: (patch: Parameters<typeof settingsService.updateProfile>[1]) =>
      settingsService.updateProfile(userId!, patch),
  })
}

export function useUploadAvatar(userId: string | null) {
  return useMutation({
    mutationFn: (file: File) => settingsService.uploadAvatar(userId!, file),
  })
}
