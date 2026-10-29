import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Menu, Smartphone, X } from 'lucide-react'
import { CounselMark } from '@/shared/components/counsel-mark'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { Button } from '@/shared/components/ui/button'
import { useAuth } from '@/features/auth/context/auth-provider'
import { EXPO } from '@/features/landing/components/motion-kit'
import { MarketingLoader } from '@/features/landing/components/home/arrival'
import { useInstallAction } from '@/shared/components/install-app'
import { cn } from '@/shared/lib/utils'
import { APP } from '@/shared/config/env'

const NAV = [
  { to: '/features', label: 'Features' },
  { to: '/#how-it-works', label: 'How it works', hash: true },
  { to: '/pricing', label: 'Pricing' },
  { to: '/templates', label: 'Templates' },
  { to: '/blog', label: 'Blog' },
  { to: '/#contact', label: 'Contact', hash: true },
]

/**
 * Header for the whole marketing site (homepage + content pages).
 *
 * Sits transparent over the top of the page, turns solid once you scroll,
 * and switches to the dark treatment while it's over a [data-night]
 * section. On phones it collapses to the mark, a Start Free pill and a
 * full-screen menu.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [solid, setSolid] = useState(false)
  const [night, setNight] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { status, signOut } = useAuth()
  const reduce = useReducedMotion()
  const getApp = useInstallAction()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    const onScroll = () => {
      setSolid(window.scrollY > 24)
      const nights = document.querySelectorAll('[data-night]')
      let over = false
      nights.forEach((s) => {
        const r = s.getBoundingClientRect()
        if (r.top <= 32 && r.bottom >= 32) over = true
      })
      setNight(over)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [pathname])

  // No page scroll behind the open phone menu.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const goToLogin = async () => {
    // A stale session must never bounce this click straight to the dashboard —
    // "Log in" from the marketing site always lands on the login form.
    if (status === 'authenticated') await signOut()
    navigate('/auth/login')
  }

  const dark = night && !open
  const link = (n: (typeof NAV)[number], cls: string, activeCls: string) =>
    n.hash ? (
      <a key={n.to} href={n.to} className={cls}>
        {n.label}
      </a>
    ) : (
      <NavLink key={n.to} to={n.to} className={({ isActive }) => cn(cls, isActive && activeCls)}>
        {n.label}
      </NavLink>
    )

  return (
    <>
      <MarketingLoader />
      {getApp.dialog}
      <header
        className={cn(
          'sticky top-0 z-50 transition-colors duration-300',
          solid || open ? 'border-b backdrop-blur-md' : 'border-b border-transparent',
          dark ? 'border-sidebar-border bg-sidebar/90 text-sidebar-foreground' : solid || open ? 'border-border/70 bg-background/85' : 'bg-transparent',
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${APP.product} home`}>
            <CounselMark className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="whitespace-nowrap font-display text-[17px] font-semibold sm:text-lg">{APP.product}</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
            {NAV.map((n) =>
              link(
                n,
                cn('relative text-sm transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100', dark ? 'text-sidebar-muted hover:text-sidebar-foreground' : 'text-muted-foreground hover:text-foreground'),
                cn('after:scale-x-100', dark ? 'text-sidebar-foreground' : 'text-foreground'),
              ),
            )}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle className={cn('hidden sm:flex', dark && 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground')} />
            <Button
              size="sm"
              variant="outline"
              className={cn('hidden bg-transparent sm:inline-flex', dark ? 'border-sidebar-border text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground' : 'border-border text-foreground hover:bg-accent hover:text-foreground')}
              onClick={goToLogin}
            >
              Log in
            </Button>
            <Button asChild size="sm" className="rounded-full px-4 shadow-gold">
              <Link to="/auth/register">Start Free</Link>
            </Button>
            <button
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={cn('-mr-1 rounded-full p-2 md:hidden', dark ? 'hover:bg-sidebar-hover' : 'hover:bg-accent')}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Phone menu: full screen, big display links that rise in one by one. */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col overflow-y-auto bg-background px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 md:hidden"
            initial={reduce ? { opacity: 0 } : { clipPath: 'inset(0 0 100% 0)' }}
            animate={reduce ? { opacity: 1 } : { clipPath: 'inset(0 0 0% 0)' }}
            exit={reduce ? { opacity: 0 } : { clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.55, ease: EXPO }}
          >
            <nav aria-label="Mobile" className="flex-1">
              {[{ to: '/', label: 'Home' }, ...NAV].map((n, i) => (
                <div key={n.to} className="overflow-hidden border-b border-border/70">
                  <motion.div
                    initial={reduce ? false : { y: '110%' }}
                    animate={{ y: '0%' }}
                    transition={{ duration: 0.8, ease: EXPO, delay: 0.12 + i * 0.06 }}
                  >
                    {'hash' in n && n.hash ? (
                      <a href={n.to} onClick={() => setOpen(false)} className="flex items-center justify-between py-4 font-display text-3xl font-semibold">
                        {n.label} <ArrowRight className="h-5 w-5 text-primary" />
                      </a>
                    ) : (
                      <NavLink
                        to={n.to}
                        end={n.to === '/'}
                        className={({ isActive }) => cn('flex items-center justify-between py-4 font-display text-3xl font-semibold', isActive && 'text-primary')}
                      >
                        {n.label} <ArrowRight className="h-5 w-5 text-primary" />
                      </NavLink>
                    )}
                  </motion.div>
                </div>
              ))}
            </nav>
            <motion.div
              className="mt-8 grid gap-3"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EXPO, delay: 0.5 }}
            >
              <Button asChild size="lg" className="w-full rounded-full shadow-gold">
                <Link to="/auth/register">
                  Start free for 30 days <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="w-full rounded-full border-border bg-transparent" onClick={goToLogin}>
                Log in
              </Button>
              {getApp.available && (
                <Button size="lg" variant="ghost" className="w-full rounded-full" onClick={getApp.start}>
                  <Smartphone className="h-4 w-4 text-primary" /> Get the app
                </Button>
              )}
              <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>No card required</span>
                <ThemeToggle />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
