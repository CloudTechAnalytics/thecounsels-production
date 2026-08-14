import { NavLink, useNavigate } from 'react-router-dom'
import { Users2, ArrowLeft } from 'lucide-react'
import { HR_NAVIGATION, type HrNavItem } from '@/features/hr/navigation'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useBackToWorkspaceTarget } from '@/shared/hooks/use-back-to-workspace-target'
import { cn } from '@/shared/lib/utils'

function useVisible() {
  const { has } = usePermissions()
  return (item: HrNavItem) => !item.permission || has(item.permission)
}

/** Entirely separate from the firm's practice sidebar — its own header,
 * its own nav, no Matters/Clients/Documents in sight. Mirrors
 * PlatformSidebar's shape (this app's existing pattern for "a completely
 * different workspace behind the same login"), not the practice Sidebar. */
export function HrSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const isVisible = useVisible()
  const { activeMembership } = useAuth()
  const navigate = useNavigate()
  const org = activeMembership?.organization
  const backToWorkspaceTarget = useBackToWorkspaceTarget()

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-sidebar-accent ring-1 ring-sidebar-border">
          <Users2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[15px] font-semibold">HR Workspace</p>
          <p className="truncate text-[11px] text-sidebar-muted">{org?.name ?? 'The Counsel'}</p>
        </div>
      </div>

      <div className="px-3 pt-1">
        <button
          onClick={() => { navigate(backToWorkspaceTarget); onNavigate?.() }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Workspace
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {HR_NAVIGATION.map((section, i) => {
          const items = section.items.filter(isVisible)
          if (items.length === 0) return null
          return (
            <div key={i}>
              {section.heading && (
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-sidebar-hover text-sidebar-foreground'
                            : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0 transition-colors',
                              isActive ? 'text-sidebar-accent' : 'text-sidebar-muted group-hover:text-sidebar-foreground',
                            )}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge && <item.badge />}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-sidebar-muted">
        HR Workspace · v1.0
      </div>
    </aside>
  )
}
