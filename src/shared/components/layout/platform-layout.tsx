import * as React from 'react'
import { Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, RefreshCw, ShieldCheck } from 'lucide-react'
import { PlatformSidebar } from '@/shared/components/layout/platform-sidebar'
import { PlatformNotifications } from '@/shared/components/layout/platform-notifications'
import { UserMenu } from '@/shared/components/layout/user-menu'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'

/** CloudTech Platform console shell. Entirely separate from the firm workspace. */
export function PlatformLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="flex h-full min-h-screen bg-background">
      <div className="hidden shrink-0 lg:block">
        <PlatformSidebar />
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
              <PlatformSidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Badge variant="default" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Platform Console
          </Badge>
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="icon" onClick={() => window.location.reload()} aria-label="Refresh page" title="Refresh page">
              <RefreshCw className="h-5 w-5" />
            </Button>
            <ThemeToggle />
            <PlatformNotifications />
            <UserMenu settingsPath="/platform/settings" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
