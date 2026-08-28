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
export function HrSidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const isVisible = useVisible()
  const { activeMembership } = useAuth()
  const navigate = useNavigate()
  const org = activeMembership?.organization
  const backToWorkspaceTarget = useBackToWorkspaceTarget()

  return (
    <aside className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width]', collapsed ? 'w-[68px]' : 'w-64')}>
      <div className={cn('flex h-16 items-center gap-3', collapsed ? 'justify-center px-2' : 'px-5')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sidebar-accent ring-1 ring-sidebar-border">
          <Users2 className="h-5 w-5" />
        </span>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[15px] font-semibold">HR Workspace</p>
            <p className="truncate text-[11px] text-sidebar-muted">{org?.name ?? 'The Counsel'}</p>
          </div>
        )}
      </div>

      <div className={cn('pt-1', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={() => { navigate(backToWorkspaceTarget); onNavigate?.() }}
          title={collapsed ? 'Back to Workspace' : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground',
            collapsed ? 'justify-center px-2' : 'px-3',
          )}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" /> {!collapsed && 'Back to Workspace'}
        </button>
      </div>

      <nav className={cn('flex-1 space-y-6 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        {HR_NAVIGATION.map((section, i) => {
          const items = section.items.filter(isVisible)
          if (items.length === 0) return null
          return (
            <div key={i}>
              {section.heading && !collapsed && (
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
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors',
                          collapsed ? 'justify-center px-2' : 'px-3',
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
                          {!collapsed && (
                            <>
                              <span className="flex-1 truncate">{item.label}</span>
                              {item.badge && <item.badge />}
                            </>
                          )}
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

      {!collapsed && (
        <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-sidebar-muted">
          HR Workspace · v1.0
        </div>
      )}
    </aside>
  )
}
