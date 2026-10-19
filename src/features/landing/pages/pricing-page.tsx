import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, Users, HardDrive } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/components/ui/button'
import {
  BILLING_CYCLES,
  CYCLE_LABEL,
  CYCLE_MONTHS,
  CYCLE_SUFFIX,
  cycleDiscountPercent,
  monthlyEquivalent,
} from '@/shared/lib/billing-cycle'
import type { BillingCycle, Plan } from '@/shared/types/database.types'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { PUBLIC_PLANS, naira } from '@/features/landing/lib/pricing-data'

const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'
const INTENDED_PLAN_KEY = 'counsel.intended_plan'

const INCLUDED = [
  'Free 30-day trial, no card required',
  'Matters, clients, hearings and calendar',
  'Document storage, encrypted',
  'Time tracking, invoices and payments',
  'Row-level firm data isolation',
  'Full audit trail on every action',
  'Onboarding help to bring in your records',
  'Upgrade, downgrade or cancel any time',
]

const FAQS = [
  {
    q: 'Is there really a free trial?',
    a: 'Yes. Every firm gets 30 days free with no card required. You create your firm, invite your team and use the system properly before deciding.',
  },
  {
    q: 'How do I pay?',
    a: 'Your Managing Partner subscribes from Firm Settings. Card and bank payments are processed securely by Paystack, and every payment is recorded against your firm.',
  },
  {
    q: 'What does paying quarterly or yearly save?',
    a: 'Longer billing cycles cost less per month. Use the toggle above to see the exact saving on each plan.',
  },
  {
    q: 'Can we change plans later?',
    a: 'Yes. Upgrades apply immediately; downgrades take effect on your next billing date.',
  },
  {
    q: 'We practise outside Nigeria. What currency do you bill in?',
    a: 'Prices are shown in naira today. If your firm is elsewhere in Africa, start your free trial and we will confirm pricing in your own currency.',
  },
  {
    q: 'What if we outgrow 25 users?',
    a: 'Choose Enterprise. We set the number of users, storage and integrations around your firm and quote you directly.',
  },
]

export function PricingPage() {
  useSeo({
    title: 'Pricing | The Counsel: Legal Practice Management Software',
    description:
      'Simple per-firm pricing for law firms across Africa. Start a free 30-day trial; plans from ₦15,000 a month with savings on quarterly, six-monthly and yearly billing.',
    canonicalPath: '/pricing',
  })
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-10 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            One price for your whole firm
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            No per-lawyer surprises. Pick the plan that fits your headcount, try it free for 30 days, and
            change it whenever your firm changes.
          </p>

          <div
            role="radiogroup"
            aria-label="Billing cycle"
            className="mx-auto mt-9 inline-flex flex-wrap justify-center gap-1 rounded-full border border-border bg-card p-1"
          >
            {BILLING_CYCLES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cycle === c}
                onClick={() => setCycle(c)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  cycle === c ? 'bg-primary text-primary-foreground shadow-gold' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {CYCLE_LABEL[c]}
              </button>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PUBLIC_PLANS.map((p) => {
              const priceRow = p.prices
                ? ({
                    price_monthly: p.prices.monthly,
                    price_quarterly: p.prices.quarterly,
                    price_semiannual: p.prices.semiannual,
                    price_yearly: p.prices.yearly,
                  } as unknown as Plan)
                : null
              const total = p.prices?.[cycle]
              const perMonth = priceRow ? monthlyEquivalent(cycle, priceRow) : null
              const save = priceRow ? cycleDiscountPercent(cycle, priceRow) : null
              return (
                <motion.div
                  key={p.key}
                  whileHover={{ y: -6 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  className={cn(
                    'relative flex flex-col rounded-xl border bg-card p-6 shadow-card',
                    p.highlight ? 'border-primary shadow-gold' : 'border-border',
                  )}
                >
                  {p.highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                      Recommended
                    </span>
                  )}
                  <h2 className="font-display text-xl font-semibold">{p.name}</h2>
                  <p className="mt-1 min-h-[2.75rem] text-sm text-muted-foreground">{p.tagline}</p>

                  <div className="mt-5 min-h-[7.5rem] border-b border-border pb-5">
                    {perMonth != null && total != null ? (
                      <>
                        <p>
                          <span className="font-display text-3xl font-semibold">{naira(perMonth)}</span>
                          <span className="text-sm text-muted-foreground"> /month</span>
                        </p>
                        {cycle !== 'monthly' ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {naira(total)}
                            {CYCLE_SUFFIX[cycle]}, billed every {CYCLE_MONTHS[cycle]} months
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">Billed monthly</p>
                        )}
                        {save != null && (
                          <span className="mt-2 inline-block rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            Save {save}%
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-display text-3xl font-semibold">Custom</p>
                        <p className="mt-2 text-sm text-muted-foreground">Priced around your firm</p>
                      </>
                    )}
                  </div>

                  <ul className="mt-5 space-y-2 text-sm font-medium">
                    <li className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" /> {p.users}
                    </li>
                    <li className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-primary" /> {p.storage}
                    </li>
                  </ul>
                  <ul className="mt-4 flex-1 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>

                  {p.prices ? (
                    <Button asChild className="mt-6" variant={p.highlight ? 'default' : 'outline'}>
                      <Link
                        to="/auth/register"
                        onClick={() => {
                          try {
                            localStorage.setItem(INTENDED_PLAN_KEY, p.key)
                          } catch {
                            /* storage unavailable: wizard just defaults to trial */
                          }
                        }}
                      >
                        Start free trial
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild className="mt-6" variant="outline">
                      <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
                    </Button>
                  )}
                </motion.div>
              )
            })}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
            Prices are shown in naira (₦) per firm. Practising outside Nigeria? Start your free trial and
            we&rsquo;ll confirm pricing in your own currency.
          </p>
        </section>

        <section className="border-y border-border bg-card/50">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">Every plan includes</h2>
            <ul className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {INCLUDED.map((i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm sm:text-base">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> {i}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">Billing questions</h2>
          <div className="mt-10 space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-card p-5 open:shadow-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold marker:content-none">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <SeoCtaBand heading="Try it with your own matters, free for 30 days" />
      </main>

      <SiteFooter />
    </div>
  )
}
