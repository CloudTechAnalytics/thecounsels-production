import { useEffect } from 'react'

/**
 * Per-page SEO metadata, applied by mutating the SAME tags already seeded
 * in index.html — deliberately NOT a react-helmet-style library that
 * inserts brand-new tags. This app is a pure client-rendered SPA with no
 * SSR/prerendering: index.html's static title/description/canonical/OG/
 * Twitter tags are also what a non-JS-executing crawler (WhatsApp/
 * Facebook/LinkedIn link unfurlers, in particular — a very real audience
 * for a Nigerian product — do NOT run JavaScript) sees, for ANY route,
 * since every route serves the same static shell. Adding new tags on top
 * of those instead of updating them in place would leave two conflicting
 * <meta name="description">, two canonicals, etc. in the DOM for anything
 * that DOES execute JS (Google does) — exactly the duplicate-tag problem
 * real SEO tooling flags. Mutating in place means:
 *   - Google (renders JS): sees the correct per-page values.
 *   - Non-JS crawlers on a deep page: fall back to index.html's sitewide
 *     defaults (the homepage's own values) — not wrong, just generic;
 *     true per-page social-preview fidelity would need prerendering,
 *     which is a bigger, separate change (see the implementation notes).
 * Previous values are restored on unmount so navigating within the SPA
 * back to a page that doesn't call this hook doesn't leave stale values
 * behind.
 */
export interface SeoMeta {
  title: string
  description: string
  /** Path only, e.g. "/law-firm-management-software" — the origin is added here. */
  canonicalPath: string
}

const ORIGIN = 'https://thecounsels.org'

function setAttr(selector: string, attr: string, value: string): (() => void) | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const prev = el.getAttribute(attr)
  el.setAttribute(attr, value)
  return () => {
    if (prev === null) el.removeAttribute(attr)
    else el.setAttribute(attr, prev)
  }
}

export function useSeo({ title, description, canonicalPath }: SeoMeta) {
  useEffect(() => {
    const canonicalUrl = `${ORIGIN}${canonicalPath}`
    const prevTitle = document.title
    document.title = title

    const restores = [
      setAttr('meta[name="description"]', 'content', description),
      setAttr('link[rel="canonical"]', 'href', canonicalUrl),
      setAttr('meta[property="og:title"]', 'content', title),
      setAttr('meta[property="og:description"]', 'content', description),
      setAttr('meta[property="og:url"]', 'content', canonicalUrl),
      setAttr('meta[name="twitter:title"]', 'content', title),
      setAttr('meta[name="twitter:description"]', 'content', description),
    ]

    return () => {
      document.title = prevTitle
      restores.forEach((restore) => restore?.())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonicalPath])
}

/**
 * The whole authenticated app (dashboard, matters, billing, platform
 * console — every real firm's private data) must never be indexable, even
 * though index.html's static <meta name="robots"> defaults to "index,
 * follow" for the marketing shell. One call in RequireAuth (route-guards.tsx)
 * covers the entire authenticated route tree instead of touching every
 * individual page. robots.txt is still the primary defense (tells
 * compliant crawlers not to even fetch these URLs); this is the
 * defense-in-depth layer for the rare case a URL is fetched directly.
 */
export function useNoIndexWhenActive(active: boolean) {
  useEffect(() => {
    if (!active) return undefined
    const restore = setAttr('meta[name="robots"]', 'content', 'noindex, nofollow')
    return () => restore?.()
  }, [active])
}
