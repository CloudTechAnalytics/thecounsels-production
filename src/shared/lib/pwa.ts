/**
 * Installable-app (PWA) plumbing: service worker registration and the
 * "Add to Home Screen" prompt.
 *
 * Android/Chrome fires `beforeinstallprompt`, which we hold on to so a button
 * can trigger the native install sheet later. iOS Safari has no such event —
 * installing is only ever Share → Add to Home Screen — so for iOS we just
 * detect the platform and show instructions instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function canPromptInstall(): boolean {
  return deferred !== null && !installed
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS reports itself as a Mac; the touch check tells them apart.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Opens the native install sheet (Android/desktop Chrome). Resolves true if the user installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null
  emit()
  await ev.prompt()
  const { outcome } = await ev.userChoice
  return outcome === 'accepted'
}

export function setupPwa(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()                       // keep Chrome's mini-infobar quiet; we show our own button
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
  // Dev server rebuilds constantly; a caching worker there only gets in the way.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    })
  }
}
