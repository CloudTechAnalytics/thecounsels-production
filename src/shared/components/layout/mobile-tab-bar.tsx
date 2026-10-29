import { NavLink } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { NAVIGATION, type NavItem } from '@/app/navigation'
import { useNavItemVisible } from '@/shared/components/layout/sidebar'
import { cn } from '@/shared/lib/utils'

/** The screens a lawyer reaches for most on a phone, in tab order. The first
 * four this user can actually open become tabs; everything else stays one tap
 * away under "More" (the full sidebar drawer). */
const PREFERRED = ['/', '/matters', '/hearings', '/tasks', '/clients', '/calendar', '/documents']
const SHORT: Record<string, string> = { '/': 'Home' }

/** Phone-only bottom navigation, like a native app. Hidden from lg up, where
 * the sidebar is always visible. Sits above the iPhone home indicator. */
export function MobileTabBar({ onMore }: { onMore: () => void }) {
  const isVisible = useNavItemVisible()
  const all = NAVIGATION.flatMap((s) => s.items)
  const tabs = PREFERRED.map((to) => all.find((i) => i.to === to))
    .filter((i): i is NavItem => Boolean(i) && isVisible(i!))
    .slice(0, 4)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
        {tabs.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-primary/12')}>
                    <item.icon className="h-[20px] w-[20px]" />
                  </span>
                  <span className="max-w-full truncate px-1">{SHORT[item.to] ?? item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onMore}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors active:text-foreground"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="h-[20px] w-[20px]" />
            </span>
            <span>More</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
