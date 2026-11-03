import { useEffect, useSyncExternalStore } from 'react'

/**
 * Google Analytics for the public marketing site only — never the
 * authenticated app, where firms keep confidential client data.
 *
 * - Nothing loads until the visitor accepts the cookie banner (Nigeria's
 *   NDPA 2023 and its peers across Africa require consent for analytics
 *   cookies).
 * - A page opts in by calling useTrackedPage() (useSeo does this for every
 *   marketing page). Leaving tracked pages flips GA's official per-property
 *   opt-out flag, so a gtag already loaded this session stays silent inside
 *   the app. The GA stream's "page changes based on browser history events"
 *   setting must stay OFF; page views are sent from here instead.
 */
export const GA_MEASUREMENT_ID = 'G-G9JBWZXYDN'

type Consent = 'granted' | 'denied' | null
const CONSENT_KEY = 'counsel.cookie-consent'

type Gtag = (...args: unknown[]) => void
declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: Gtag
  }
}
const disableFlag = `ga-disable-${GA_MEASUREMENT_ID}`

function readConsent(): Consent {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    return v === 'granted' || v === 'denied' ? v : null
  } catch {
    return null
  }
}

let consent: Consent = typeof window === 'undefined' ? null : readConsent()
let trackedPages = 0
let loaded = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function setDisabled(disabled: boolean) {
  ;(window as unknown as Record<string, boolean>)[disableFlag] = disabled
}

function ensureLoaded() {
  if (loaded || consent !== 'granted') return
  loaded = true
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() {
    // gtag.js reads the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(s)
}

function sendPageView() {
  if (consent !== 'granted' || trackedPages === 0) return
  ensureLoaded()
  window.gtag?.('event', 'page_view', {
    page_location: window.location.origin + window.location.pathname,
    page_title: document.title,
  })
}

export function setConsent(value: 'granted' | 'denied') {
  consent = value
  try {
    localStorage.setItem(CONSENT_KEY, value)
  } catch {
    // private mode etc. — the choice just won't persist past this load
  }
  if (value === 'granted') sendPageView()
  else setDisabled(true)
  notify()
}

/** Reopen the banner (e.g. a "Cookie settings" link). */
export function resetConsent() {
  consent = null
  try {
    localStorage.removeItem(CONSENT_KEY)
  } catch {
    // ignore
  }
  notify()
}

/** Send a conversion event (e.g. 'sign_up'), only from a tracked page with consent. */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (consent !== 'granted' || trackedPages === 0) return
  ensureLoaded()
  window.gtag?.('event', name, params)
}

/** Marks the current page as public/trackable and records a page view. */
export function useTrackedPage(pathKey: string) {
  useEffect(() => {
    trackedPages++
    setDisabled(consent !== 'granted')
    notify()
    // wait a frame so useSeo's title update has landed
    const id = requestAnimationFrame(sendPageView)
    return () => {
      cancelAnimationFrame(id)
      trackedPages--
      if (trackedPages === 0) setDisabled(true)
      notify()
    }
  }, [pathKey])
}

/** True while a tracked page is showing and the visitor hasn't chosen yet. */
export function useConsentPrompt(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => consent === null && trackedPages > 0,
    () => false,
  )
}
