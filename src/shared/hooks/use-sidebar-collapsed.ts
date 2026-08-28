import * as React from 'react'

/** Persisted per-browser desktop sidebar collapse state, shared by all
 * three sidebars (practice, HR, platform console) — each passes its own
 * storageKey so collapsing one doesn't affect the others. */
export function useSidebarCollapsed(storageKey: string) {
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem(storageKey) === 'true')
  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(storageKey, String(next))
      return next
    })
  }, [storageKey])
  return [collapsed, toggle] as const
}
