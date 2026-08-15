import { NavLink } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { NAVIGATION, type NavItem } from '@/app/navigation'
import { useAuth } from '@/features/auth/context/auth-provider'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { usePlanFeature } from '@/features/administration/hooks/use-administration'
import { initialsOf } from '@/shared/lib/format'
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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const isVisible = useVisible()
  const { activeMembership } = useAuth()
  const org = activeMembership?.organization

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-primary/15 text-sm font-semibold text-sidebar-accent ring-1 ring-sidebar-border">
          {org?.logo_url ? (
            <img src={org.logo_url} alt="" className="h-full w-full object-cover" />
          ) : org ? (
            initialsOf(org.name, 'OR')
          ) : (
            <Scale className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate font-display text-[15px] font-semibold">{org?.name ?? 'The Counsel'}</p>
          <p className="text-[11px] text-sidebar-muted">Powered by The Counsel</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAVIGATION.map((section, i) => {
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
        CloudTech Legal Suite · v1.0
      </div>
    </aside>
  )
}
