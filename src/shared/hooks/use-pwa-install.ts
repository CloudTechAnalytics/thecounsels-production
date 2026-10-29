import { useSyncExternalStore } from 'react'
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from '@/shared/lib/pwa'

/**
 * What install option this device has:
 *  - 'prompt'  Android/Chrome: we can open the native install sheet
 *  - 'ios'     iPhone/iPad Safari: show Share → Add to Home Screen steps
 *  - null      already installed, or the browser can't install apps
 */
export function usePwaInstall() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false)
  const standalone = isStandalone()
  const mode: 'prompt' | 'ios' | null = standalone ? null : canPrompt ? 'prompt' : isIos() ? 'ios' : null
  return { mode, install: promptInstall }
}
