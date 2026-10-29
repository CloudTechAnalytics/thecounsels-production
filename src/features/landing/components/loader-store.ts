import { useSyncExternalStore } from 'react'

/**
 * Whether the marketing-site loader (logo + 0–100%) has lifted for this page
 * load. Starts pending on every full load/refresh; client-side navigation
 * between marketing pages never resets it, so the loader shows once per load.
 * Entrance animations wait on this so they play as the page is revealed,
 * not hidden behind the loader.
 */
const prefersReduced =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let lifted = prefersReduced
const listeners = new Set<() => void>()

export function liftLoader(): void {
  if (lifted) return
  lifted = true
  listeners.forEach((l) => l())
}

export function isLoaderLifted(): boolean {
  return lifted
}

export function useLoaderLifted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => lifted,
    () => true,
  )
}
