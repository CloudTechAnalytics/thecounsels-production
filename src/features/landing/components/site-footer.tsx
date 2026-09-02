import { Link } from 'react-router-dom'
import { CounselMark } from '@/shared/components/counsel-mark'
import { APP } from '@/shared/config/env'

const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'

/**
 * Footer for the SEO content pages (2026-09-01) — carries the internal
 * links back to the homepage's real sections plus the sibling SEO pages,
 * so every one of these pages is a couple of clicks from every other
 * (homepage, pricing, a demo/contact path, login) rather than a dead end.
 */
export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-border bg-background py-14 text-foreground">
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <CounselMark variant="small" className="h-7 w-7" />
              <span className="font-display font-semibold">{APP.product}</span>
            </div>
            <p className="mt-4 max-w-[220px] text-sm leading-relaxed text-muted-foreground">
              Legal practice management software for law firms across Nigeria and Africa.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/" className="transition-colors hover:text-primary">Home</Link></li>
              <li><Link to="/legal-practice-management-software-nigeria" className="transition-colors hover:text-primary">Legal Practice Management</Link></li>
              <li><Link to="/law-firm-management-software" className="transition-colors hover:text-primary">Law Firm Management</Link></li>
              <li><Link to="/legal-case-management-software" className="transition-colors hover:text-primary">Case Management</Link></li>
              <li><Link to="/law-firm-billing-software" className="transition-colors hover:text-primary">Billing &amp; Invoicing</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Product</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><a href="/#features" className="transition-colors hover:text-primary">Features</a></li>
              <li><a href="/#pricing" className="transition-colors hover:text-primary">Pricing</a></li>
              <li><a href="/#faq" className="transition-colors hover:text-primary">FAQ</a></li>
              <li><a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`} className="transition-colors hover:text-primary">Request a demo</a></li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Get started</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/auth/register" className="transition-colors hover:text-primary">Start free trial</Link></li>
              <li><Link to="/auth/login" className="transition-colors hover:text-primary">Log in</Link></li>
              <li><Link to="/terms" className="transition-colors hover:text-primary">Terms &amp; Conditions</Link></li>
              <li><Link to="/privacy" className="transition-colors hover:text-primary">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row">
          <p>© {year} CloudTech Legal Suite, a product of CloudTech Analytics. All rights reserved.</p>
          <p>Built for firms practicing across Africa.</p>
        </div>
      </div>
    </footer>
  )
}
