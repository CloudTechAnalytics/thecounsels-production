import { Link } from 'react-router-dom'
import { Clock, Banknote, Receipt, FileCheck, Wallet, AlertCircle, Eye, BarChart3 } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'

const BILLING_AREAS = [
  { icon: Clock, title: 'Time entries', text: 'Lawyers log billable time against the matter they did the work for, as the day happens — not reconstructed from memory at month end.' },
  { icon: Receipt, title: 'Legal fees & expenses', text: 'Disbursements and expenses are recorded alongside time, so nothing billable gets missed when it comes time to invoice.' },
  { icon: FileCheck, title: 'Invoices', text: 'Unbilled time and expenses for a matter — or a client, across all their matters — sweep into a numbered draft invoice in seconds, ready for review.' },
  { icon: Banknote, title: 'Payments', text: 'Record payments against an invoice as they land, in naira, and see its status update automatically as it\'s partly or fully paid.' },
  { icon: Wallet, title: 'Outstanding balances', text: 'See what\'s invoiced but not yet collected across the whole firm, not client by client in a spreadsheet.' },
  { icon: Eye, title: 'Billing visibility', text: 'Firm-wide revenue and collections are visible to managing partners, partners and finance; everyone else sees their own billable hours and unbilled work instead — real numbers, scoped to the role that should see them.' },
  { icon: AlertCircle, title: 'Overdue tracking', text: 'Invoices past their due date are flagged clearly, so collections don\'t depend on someone remembering to check.' },
  { icon: BarChart3, title: 'Financial reporting', text: 'Revenue, collection rate, work in progress and per-lawyer billable performance, in one report, exportable to Excel.' },
]

/** SEO landing page targeting "law firm billing software Nigeria" and close variants. */
export function LawFirmBillingSoftwarePage() {
  useSeo({
    title: 'Law Firm Billing & Invoicing Software | The Counsel',
    description:
      'Billing and invoicing software for law firms — track time entries, legal fees, expenses, invoices, payments, outstanding balances and financial reporting in one system.',
    canonicalPath: '/law-firm-billing-software',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Billing &amp; Invoicing</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Billing and Invoicing for Law Firms
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Billable work happens on the matter — logged hours, disbursements, expenses. The Counsel turns
            that directly into invoices and tracks what's been collected, without a separate billing
            spreadsheet reconciled against what lawyers actually did.
          </p>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
              From billable work to collected revenue
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {BILLING_AREAS.map((a) => (
                <div key={a.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <a.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-base font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Billing tied to the matter, not a separate system</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Because time and expenses are logged against the same{' '}
            <Link to="/legal-case-management-software" className="text-primary hover:underline">
              matter
            </Link>{' '}
            everyone's already working in, billing never depends on someone manually copying entries into a
            separate tool. It's part of the same{' '}
            <Link to="/law-firm-management-software" className="text-primary hover:underline">
              firm-wide workspace
            </Link>
            , with financial visibility scoped by role — so juniors see their own numbers, and leadership
            sees the firm's.
          </p>
        </section>

        <SeoCtaBand heading="Turn billable work into invoices in seconds" />
      </main>

      <SiteFooter />
    </div>
  )
}
