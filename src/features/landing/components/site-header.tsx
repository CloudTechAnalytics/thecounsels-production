import { Link } from 'react-router-dom'
import { CounselMark } from '@/shared/components/counsel-mark'
import { Button } from '@/shared/components/ui/button'
import { APP } from '@/shared/config/env'

/**
 * Lightweight header for the SEO content pages (2026-09-01) — same brand
 * mark/name as the full landing page's animated header, but static and
 * simple, matching terms-page.tsx/privacy-page.tsx's existing pattern for
 * secondary public pages rather than reusing the landing page's heavier
 * scroll-reveal nav (which points at in-page anchors that don't exist here).
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <CounselMark className="h-8 w-8" />
          <span className="font-display text-base font-semibold text-foreground">{APP.product}</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Home
          </Link>
          <a href="/#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Features
          </a>
          <a href="/#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Button asChild size="sm" variant="outline" className="border-border bg-transparent">
            <Link to="/auth/login">Log in</Link>
          </Button>
          <Button asChild size="sm" className="shadow-gold">
            <Link to="/auth/register">Start Free</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
