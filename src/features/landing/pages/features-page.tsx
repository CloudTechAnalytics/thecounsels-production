import { motion, useReducedMotion } from 'framer-motion'
import {
  LayoutDashboard,
  Briefcase,
  Gavel,
  FolderLock,
  Banknote,
  KeyRound,
  Users,
  CheckCircle2,
  type LucideIcon,
} from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'

interface Feature {
  icon: LucideIcon
  title: string
  text: string
  replaces: string
  points: string[]
}

const FEATURES: Feature[] = [
  {
    icon: LayoutDashboard,
    title: 'Know where the firm stands the moment you log in',
    text: 'Open the dashboard and see what matters today: active matters, this week’s hearings, billable hours, revenue and overdue invoices. Each role sees the view that suits it.',
    replaces: 'Morning status calls and “let me check” answers',
    points: ['Matters in court and hearings this week', 'Billable hours, revenue and outstanding invoices', 'Role-aware views for partners, associates and finance'],
  },
  {
    icon: Briefcase,
    title: 'Every client and matter on one record',
    text: 'Individual and corporate clients, their contacts and every matter they are connected to live in one searchable place. Each matter is numbered, has a status and a named lead lawyer.',
    replaces: 'Client spreadsheets and scattered case notes',
    points: ['Individual and corporate client records', 'Numbered matters with status and lead lawyer', 'Notes and a full activity timeline per matter'],
  },
  {
    icon: Gavel,
    title: 'Court dates the whole firm can see',
    text: 'Record each hearing with its court, judge, date and outcome. Dates appear on one shared calendar, and reminders reach your team by email and WhatsApp before the day.',
    replaces: 'Paper diaries and dates buried in WhatsApp chats',
    points: ['Hearings with court, judge, status and outcome', 'A shared firm calendar', 'Email and WhatsApp reminders'],
  },
  {
    icon: FolderLock,
    title: 'Case files that do not live in a cabinet',
    text: 'File contracts, court documents and evidence against the matter in private, access-controlled storage. View PDFs and images in the app without downloading them.',
    replaces: 'Shared drives and email attachments',
    points: ['Documents filed on the matter', 'Private, role-controlled storage', 'View PDFs and images in the browser'],
  },
  {
    icon: Banknote,
    title: 'Time, invoices and payments without the spreadsheet',
    text: 'Log billable time against a matter, turn unbilled work into a numbered invoice and record payments as they arrive. Expenses and disbursements sit beside the time, so you see earned, collected and owed.',
    replaces: 'Separate billing spreadsheets and forgotten invoices',
    points: ['Time entries to numbered invoices', 'Payments, expenses and disbursements', 'Naira billing today, built for firms across Africa'],
  },
  {
    icon: KeyRound,
    title: 'The right access for every role',
    text: 'Managing partners, partners, associates, paralegals, finance and support staff each get access scoped to what their role needs. Firms with several offices can scope people and reporting by branch.',
    replaces: 'Shared logins and “ask the partner for access”',
    points: ['Role-based permissions', 'Branches for multi-office firms', 'Every firm’s data isolated, with an audit log'],
  },
  {
    icon: Users,
    title: 'Your team, tasks and AI assistant in one place',
    text: 'Assign tasks with due dates, message your team next to the matter and keep staff records in the HR workspace. On qualifying plans, an AI assistant answers questions about your own hearings, tasks and appointments.',
    replaces: 'Scattered chat groups, task lists and HR files',
    points: ['Tasks tied to matters, with owners and deadlines', 'Team messaging and an HR workspace', 'An AI assistant on qualifying plans'],
  },
]

function FeatureSection({ f, index }: { f: Feature; index: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="grid gap-8 border-t border-border py-14 first:border-t-0 md:grid-cols-[6rem_1fr] md:gap-10"
    >
      <div className="flex items-start gap-5 md:flex-col md:gap-4">
        <span className="font-display text-5xl font-semibold leading-none text-primary/70">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <f.icon className="h-6 w-6" />
        </span>
      </div>
      <div>
        <h2 className="max-w-2xl font-display text-2xl font-semibold leading-snug sm:text-3xl">{f.title}</h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{f.text}</p>
        <ul className="mt-6 space-y-2.5">
          {f.points.map((p) => (
            <li key={p} className="flex items-start gap-3 text-sm sm:text-base">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> {p}
            </li>
          ))}
        </ul>
        <p className="mt-6 inline-flex flex-wrap items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs sm:text-sm">
          <span className="font-semibold uppercase tracking-[0.16em] text-primary">Replaces</span>
          <span className="text-muted-foreground">{f.replaces}</span>
        </p>
      </div>
    </motion.section>
  )
}

/** Features overview at /features. */
export function FeaturesPage() {
  useSeo({
    title: 'Features: Legal Practice Management for Law Firms | The Counsel',
    description:
      'Matters, clients, court dates, documents, billing, roles, tasks and an AI assistant in one workspace for law firms across Africa. See everything The Counsel replaces.',
    canonicalPath: '/features',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-8 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            The whole practice, in one workspace
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Seven parts of running a law firm, brought together. Each one replaces a tool, a spreadsheet or a
            habit that was costing your team time.
          </p>
        </section>

        <div className="mx-auto max-w-4xl px-6 pb-12">
          {FEATURES.map((f, i) => (
            <FeatureSection key={f.title} f={f} index={i} />
          ))}
        </div>

        <SeoCtaBand heading="See it working for your firm" />
      </main>

      <SiteFooter />
    </div>
  )
}
