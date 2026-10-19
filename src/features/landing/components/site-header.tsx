import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { CounselMark } from '@/shared/components/counsel-mark'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/features', label: 'Features', end: false },
  { to: '/pricing', label: 'Pricing', end: false },
  { to: '/blog', label: 'Blog', end: false },
]

/**
 * Header for the public content pages — same brand mark as the landing
 * page, with route-aware active links and a mobile menu.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [pathname])

  return (
    <header className="relative border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <CounselMark className="h-8 w-8" />
          <span className="font-display text-base font-semibold text-foreground">{APP.product}</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'text-sm transition-colors hover:text-foreground',
                  isActive ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline" className="hidden border-border bg-transparent sm:inline-flex">
            <Link to="/auth/login">Log in</Link>
          </Button>
          <Button asChild size="sm" className="shadow-gold">
            <Link to="/auth/register">Start Free</Link>
          </Button>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="rounded-md p-2 text-foreground hover:bg-accent md:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          aria-label="Mobile"
          className="absolute inset-x-0 top-16 z-40 border-b border-border bg-background px-6 pb-4 shadow-card md:hidden"
        >
          {[...NAV, { to: '/auth/login', label: 'Log in', end: false }].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  'block border-b border-border/60 py-3 text-base last:border-0',
                  isActive ? 'font-semibold text-primary' : 'text-foreground',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}
