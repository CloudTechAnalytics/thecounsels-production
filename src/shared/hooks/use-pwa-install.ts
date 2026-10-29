import { useSyncExternalStore } from 'react'
import { canPromptInstall, isAndroid, isIos, isStandalone, promptInstall, subscribeInstall } from '@/shared/lib/pwa'

/**
 * What install option this device has:
 *  - 'prompt'  Android/Chrome: we can open the native install sheet
 *  - 'ios'     iPhone/iPad: show Share → Add to Home Screen steps
 *  - 'android' Android, but Chrome is holding its prompt back (e.g. it was
 *              dismissed before): show the browser-menu steps instead
 *  - null      already installed, or the browser can't install apps
 */
export function usePwaInstall() {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false)
  const standalone = isStandalone()
  const mode: 'prompt' | 'ios' | 'android' | null = standalone ? null : canPrompt ? 'prompt' : isIos() ? 'ios' : isAndroid() ? 'android' : null
  return { mode, install: promptInstall }
}
