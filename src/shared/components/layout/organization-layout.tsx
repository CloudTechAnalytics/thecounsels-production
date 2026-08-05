import * as React from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from '@/shared/components/layout/sidebar'
import { Topbar } from '@/shared/components/layout/topbar'
import { NoOrganizationState } from '@/shared/components/layout/no-organization-state'
import { SupportModeBanner } from '@/shared/components/layout/support-mode-banner'
import { useAuth } from '@/features/auth/context/auth-provider'

/** Law-firm workspace shell. Scoped entirely to the signed-in user's firm. */
export function OrganizationLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const { memberships, activeOrgId, supportOrgId } = useAuth()

  const hasWorkspace = (memberships.length > 0 || Boolean(supportOrgId)) && Boolean(activeOrgId)

  return (
    <div className="flex h-full min-h-screen bg-background">
      <div className="hidden shrink-0 lg:block">
        <Sidebar />
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
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <SupportModeBanner />
        <Topbar onOpenSidebar={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {hasWorkspace ? <Outlet /> : <NoOrganizationState />}
          </div>
        </main>
      </div>
    </div>
  )
}
