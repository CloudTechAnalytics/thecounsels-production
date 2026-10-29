import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from '@/app/providers'
import { router } from '@/app/router'

/** Scroll to the #hash target on in-page links, otherwise to the top on every new page. */
function useScrollOnNavigate() {
  useEffect(() => {
    let last = router.state.location.pathname + router.state.location.search
    return router.subscribe((state) => {
      if (state.navigation.state !== 'idle') return
      const { pathname, search, hash } = state.location
      const key = pathname + search
      const samePage = key === last
      last = key
      if (hash) {
        // wait a frame so the new page has rendered its anchors
        requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
      } else if (!samePage) {
        window.scrollTo(0, 0)
      }
    })
  }, [])
}

export function App() {
  useScrollOnNavigate()
  // The live app has now replaced any prerendered markup; reveal the root (see index.html).
  useEffect(() => {
    document.getElementById('root')?.removeAttribute('data-prerendered')
    document.documentElement.classList.remove('ssr-hide')
  }, [])
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
