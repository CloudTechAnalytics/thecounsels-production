import { NavLink } from 'react-router-dom'
import { NAVIGATION, type NavItem } from '@/app/navigation'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { initialsOf } from '@/shared/lib/format'
import { CounselMark } from '@/shared/components/counsel-mark'
import { cn } from '@/shared/lib/utils'

function useVisible() {
  const { has, hasAny } = usePermissions()
  const { activeOrgId } = useAuth()
  const { has: hasFeature } = usePlanFeature(activeOrgId)
  return (item: NavItem) => {
    if (item.permission) {
      const ok = Array.isArray(item.permission) ? hasAny(item.permission) : has(item.permission)
      if (!ok) return false
    }
    if (item.planFeature && !hasFeature(item.planFeature)) return false
    return true
  }
}

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const isVisible = useVisible()
  const { activeMembership } = useAuth()
  const org = activeMembership?.organization

  return (
    <aside className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width]', collapsed ? 'w-[68px]' : 'w-64')}>
      <div className={cn('flex h-16 items-center gap-3', collapsed ? 'justify-center px-2' : 'px-5')}>
        {org?.logo_url ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-sm font-semibold text-sidebar-accent ring-1 ring-sidebar-border">
            <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
          </span>
        ) : org ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-sm font-semibold text-sidebar-accent ring-1 ring-sidebar-border">
            {initialsOf(org.name, 'OR')}
          </span>
        ) : (
          <CounselMark className="h-9 w-9 shrink-0" />
        )}
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[15px] font-semibold">{org?.name ?? 'The Counsel'}</p>
            <p className="text-[11px] text-sidebar-muted">Powered by The Counsel</p>
          </div>
        )}
      </div>

      <nav className={cn('flex-1 space-y-6 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        {NAVIGATION.map((section, i) => {
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
          CloudTech Legal Suite · v1.0
        </div>
      )}
    </aside>
  )
}
