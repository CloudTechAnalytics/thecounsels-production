import * as React from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { HrSidebar } from '@/features/hr/components/hr-sidebar'
import { Topbar } from '@/shared/components/layout/topbar'

/** HR workspace shell — a separate space behind the same login, same
 * pattern this app already uses for the Platform Console (PlatformLayout).
 * No Matters/Clients/practice-area nav here at all; Topbar is reused as-is
 * (search/notifications/profile are still useful in HR mode, and its
 * profile menu is what got you here — see topbar.tsx's "Back to Workspace"
 * link for the way back). */
export function HrLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="flex h-full min-h-screen bg-background">
      <div className="hidden shrink-0 lg:block">
        <HrSidebar />
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="absolute inset-y-0 left-0"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
            >
              <HrSidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
