import * as React from 'react'
import { useNavigate, Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from '@/shared/components/layout/sidebar'
import { Topbar } from '@/shared/components/layout/topbar'
import { SidebarCollapseToggle } from '@/shared/components/layout/sidebar-collapse-toggle'
import { NoOrganizationState } from '@/shared/components/layout/no-organization-state'
import { SupportModeBanner } from '@/shared/components/layout/support-mode-banner'
import { SupportAccessRequestBanner } from '@/shared/components/layout/support-access-request-banner'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSidebarCollapsed } from '@/shared/hooks/use-sidebar-collapsed'
import { useMessagingBadgeRealtime } from '@/features/messaging/hooks/use-messaging'
import { useNotificationPreferences } from '@/features/notifications/hooks/use-notifications'
import { fireBrowserNotification } from '@/features/notifications/lib/browser-push'
import { toast } from '@/shared/components/ui/sonner'

/** Law-firm workspace shell. Scoped entirely to the signed-in user's firm. */
export function OrganizationLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  // Desktop sidebar collapses to an icon-only rail rather than hiding
  // entirely — still navigable, just narrow. Previously there was no way
  // at all to reclaim that width.
  const [collapsed, toggleCollapsed] = useSidebarCollapsed('counsel.sidebar_collapsed')
  const { memberships, activeOrgId, supportOrgId, profile } = useAuth()
  const navigate = useNavigate()
  const { data: prefs } = useNotificationPreferences(profile?.id ?? null)

  // Mounted once, here, regardless of which page is open — a WhatsApp-style
  // pop (in-app toast always; a real OS-level push too when the user has
  // browser notifications enabled) for any new channel/DM message that
  // isn't your own. Was previously written but never actually mounted
  // anywhere, so the sidebar's unread badge only ever updated on the next
  // manual refetch instead of live.
  useMessagingBadgeRealtime(activeOrgId, profile?.id ?? null, (info) => {
    toast.message(info.title, {
      description: info.body,
      action: { label: 'View', onClick: () => navigate(info.href) },
    })
    if (prefs?.browser_enabled) {
      fireBrowserNotification(info.title, { body: info.body, tag: info.href, onClick: () => navigate(info.href) })
    }
  })

  const hasWorkspace = (memberships.length > 0 || Boolean(supportOrgId)) && Boolean(activeOrgId)

  return (
    <div className="flex h-full min-h-screen bg-background">
      <div className="relative hidden shrink-0 lg:block">
        <Sidebar collapsed={collapsed} />
        <SidebarCollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />
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
        {/* Not while a platform admin is browsing via support mode — this
            is for the firm's own members deciding whether to let someone
            in, not something to show a visitor mid-session. */}
        {!supportOrgId && <SupportAccessRequestBanner />}
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
