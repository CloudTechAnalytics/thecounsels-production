import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Scale, ShieldCheck, Sparkles } from 'lucide-react'
import { APP } from '@/shared/config/env'
import { ThemeToggle } from '@/shared/components/theme-toggle'

/** Split-screen luxury auth layout: brand panel + form panel. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  back,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  /** Optional link rendered top-left above the title (e.g. back to landing). */
  back?: ReactNode
}) {
  return (
    <div className="relative grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <ThemeToggle className="absolute right-4 top-4 z-10" />

      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(60rem 60rem at 80% -10%, hsl(var(--sidebar-accent) / 0.5), transparent 60%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-sidebar-accent ring-1 ring-sidebar-border">
            <Scale className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold">{APP.product}</p>
            <p className="text-xs text-sidebar-muted">{APP.brand}</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative max-w-md"
        >
          <h2 className="font-display text-4xl font-semibold leading-tight">
            The practice management platform for the modern firm.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
            Matters, hearings, billing, documents, and people — unified in one elegant,
            enterprise-grade workspace built for legal teams.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            <li className="flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-sidebar-accent" />
              Bank-grade multi-tenant security with row-level isolation
            </li>
            <li className="flex items-center gap-3">
              <Sparkles className="h-4 w-4 text-sidebar-accent" />
              Insightful dashboards & AI-ready workflows
            </li>
          </ul>
        </motion.div>

        <p className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} {APP.brand}. All rights reserved.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Scale className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-base font-semibold">{APP.product}</p>
              <p className="text-xs text-muted-foreground">{APP.brand}</p>
            </div>
          </div>

          {back && <div className="mb-6">{back}</div>}

          <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-sm text-muted-foreground">{footer}</div>}
        </motion.div>
      </div>
    </div>
  )
}
