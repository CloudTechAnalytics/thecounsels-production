import { Link } from 'react-router-dom'
import {
  Briefcase,
  Users,
  FolderLock,
  Gavel,
  CheckSquare,
  Banknote,
  Receipt,
  ShieldCheck,
  BarChart3,
  Building2,
  Sparkles,
  KeyRound,
  CheckCircle2,
} from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'

const CAPABILITIES = [
  {
    icon: Users,
    title: 'Client management',
    text: 'Keep individual and corporate clients, their contacts and every matter they’re connected to in one searchable record — no more digging through separate spreadsheets or shared drives to find who’s who.',
  },
  {
    icon: Briefcase,
    title: 'Matter & case management',
    text: 'Every matter is automatically numbered, given a status (open, pending, in court, closed) and assigned a lead lawyer and responsible partner. Notes, a full activity timeline and a branch-aware assigned team keep everyone on the same page.',
  },
  {
    icon: FolderLock,
    title: 'Document management',
    text: 'Store contracts, court filings and evidence per matter in private, access-controlled storage, with PDFs and images viewable directly in the app — no downloading files just to check what’s in them.',
  },
  {
    icon: Gavel,
    title: 'Hearings & court dates',
    text: 'Track hearing type, status and outcome, with an assigned lawyer and any supporting lawyers on record, all reflected on a shared firm calendar so a court date is never only in one person’s head.',
  },
  {
    icon: CheckSquare,
    title: 'Tasks',
    text: 'Assign work with a due date, priority and matter link, so deadlines are visible to the team, not buried in someone’s private notebook or inbox.',
  },
  {
    icon: Banknote,
    title: 'Billing & invoicing',
    text: 'Log billable time against a matter, sweep unbilled work into a numbered invoice, and record payments as they come in — all in naira by default.',
  },
  {
    icon: Receipt,
    title: 'Expenses & payments',
    text: 'Record disbursements and expenses alongside billable time, and track outstanding balances and collections without a separate accounting spreadsheet.',
  },
  {
    icon: KeyRound,
    title: 'User roles & permissions',
    text: 'Managing partners, partners, associates, paralegals, finance and support staff each get access scoped to what their role actually needs — a junior associate never sees firm-wide revenue by accident.',
  },
  {
    icon: Building2,
    title: 'Branch management',
    text: 'Firms with more than one office can scope members, matters and reporting to a specific branch, while leadership still sees the whole firm.',
  },
  {
    icon: BarChart3,
    title: 'Reports',
    text: 'Financial, productivity, matter and client reports — visible to the roles who should see them, exportable to Excel with one click.',
  },
  {
    icon: Sparkles,
    title: 'AI capabilities',
    text: 'On qualifying plans, an AI assistant answers general legal questions and looks up your firm’s own hearings, tasks and appointments, alongside a per-matter assistant that can summarize a specific case.',
  },
  {
    icon: ShieldCheck,
    title: 'Security & access control',
    text: 'Every firm’s data is isolated at the database level (row-level security), every action is captured in an audit log, and access is enforced by role — not just hidden behind a menu.',
  },
]

/** SEO landing page targeting "legal practice management software Nigeria" and close variants. */
export function LegalPracticeManagementSoftwareNigeriaPage() {
  useSeo({
    title: 'Legal Practice Management Software in Nigeria | The Counsel',
    description:
      'The Counsel is a legal practice management platform built for Nigerian law firms — manage clients, matters, documents, hearings, tasks, billing, teams and firm operations in one secure system.',
    canonicalPath: '/legal-practice-management-software-nigeria',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">For Nigerian Law Firms</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Legal Practice Management Software for Nigerian Law Firms
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            The Counsel is a practice management platform built around how law firms in Nigeria actually
            work — from a solo practitioner to a multi-partner chambers. Clients, matters, documents,
            hearings, tasks and billing live in one secure workspace, in naira, instead of scattered across
            spreadsheets, WhatsApp threads and shared drives.
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">What The Counsel is</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            The Counsel is a legal case management software that unifies the day-to-day operations of a law
            firm — case tracking, client records, court dates, documents, billing and reporting — under one
            login, with a permission system that scopes what each person on the team can see and do. Rather
            than a single tool, it replaces a handful of disconnected ones: the spreadsheet tracking open
            matters, the shared drive holding documents, the notebook of hearing dates, and the separate
            billing sheet.
          </p>
          <h2 className="mt-10 font-display text-2xl font-semibold sm:text-3xl">Who it is designed for</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Solo practitioners who need one hub for everything, small chambers organising as they grow,
            established firms whose billing and reporting need to scale with headcount, and larger,
            multi-partner or multi-branch chambers that need firm-wide visibility without losing per-branch
            control. If your practice is currently held together by spreadsheets, shared folders and manual
            reminders, The Counsel is built to replace that.
          </p>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
              Everything a Nigerian law firm needs to run day to day
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-lg font-semibold">{c.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">How a firm gets started</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            A firm signs up, sets up its workspace, and starts a free 30-day trial — no card required. From
            there, the firm's own admin invites the rest of the team, assigns roles, and can migrate in
            existing matters, clients and documents. Explore the specific parts of the platform in more
            depth:
          </p>
          <ul className="mt-6 space-y-2.5 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <Link to="/law-firm-management-software" className="text-primary hover:underline">
                Law firm management software
              </Link>{' '}
              <span className="text-muted-foreground">— managing your people, matters and operations together.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <Link to="/legal-case-management-software" className="text-primary hover:underline">
                Legal case management software
              </Link>{' '}
              <span className="text-muted-foreground">— how matter and case workflows work in detail.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <Link to="/law-firm-billing-software" className="text-primary hover:underline">
                Law firm billing & invoicing software
              </Link>{' '}
              <span className="text-muted-foreground">— time entries, invoices, payments and financial reporting.</span>
            </li>
          </ul>
        </section>

        <SeoCtaBand heading="Bring your firm's operations into one system" />
      </main>

      <SiteFooter />
    </div>
  )
}
