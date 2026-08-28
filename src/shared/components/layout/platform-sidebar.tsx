import { NavLink } from 'react-router-dom'
import { Cloud } from 'lucide-react'
import { PLATFORM_NAVIGATION } from '@/app/platform-navigation'
import { cn } from '@/shared/lib/utils'

export function PlatformSidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  return (
    <aside className={cn('flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width]', collapsed ? 'w-[68px]' : 'w-64')}>
      <div className={cn('flex h-16 items-center gap-3', collapsed ? 'justify-center px-2' : 'px-5')}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sidebar-accent ring-1 ring-sidebar-border">
          <Cloud className="h-5 w-5" />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold">CloudTech Legal Suite</p>
            <p className="text-[11px] text-sidebar-muted">The Counsel · Platform</p>
          </div>
        )}
      </div>

      <nav className={cn('flex-1 space-y-6 overflow-y-auto py-4', collapsed ? 'px-2' : 'px-3')}>
        {PLATFORM_NAVIGATION.map((section, i) => (
          <div key={i}>
            {section.heading && !collapsed && (
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {section.heading}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => (
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
                        {!collapsed && item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-sidebar-muted">
          Platform Console · v1.0
        </div>
      )}
    </aside>
  )
}
