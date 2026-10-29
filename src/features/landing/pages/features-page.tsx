import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  LayoutDashboard,
  Briefcase,
  Users,
  Gavel,
  FolderLock,
  Banknote,
  BarChart3,
  Sparkles,
  CheckCircle2,
  KeyRound,
  Building2,
  ShieldCheck,
  FileSpreadsheet,
  CalendarDays,
  Bell,
  History,
  type LucideIcon,
} from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { cn } from '@/shared/lib/utils'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { MaskWords, Rise } from '@/features/landing/components/motion-kit'

interface Tab {
  id: string
  label: string
  icon: LucideIcon
  image: string
  path: string
  title: string
  text: string
  points: string[]
}

const TABS: Tab[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    image: '/features/dashboard.webp',
    path: 'dashboard',
    title: 'Your firm at a glance',
    text: 'Log in and see what needs you today, without opening five tools or calling the office.',
    points: [
      'Active matters and this week’s hearings',
      'Billable hours, revenue and overdue invoices',
      'Views that match each person’s role',
    ],
  },
  {
    id: 'matters',
    label: 'Matters',
    icon: Briefcase,
    image: '/features/matters.webp',
    path: 'matters',
    title: 'Every case, from intake to close',
    text: 'Each matter is numbered, has a status, a client, a practice area and a named lead lawyer, so nobody has to ask where a case stands.',
    points: [
      'Status from new to resolved and closed',
      'Search by title or matter number',
      'Filter by practice area, export when you need to',
    ],
  },
  {
    id: 'clients',
    label: 'Clients',
    icon: Users,
    image: '/features/clients.webp',
    path: 'clients',
    title: 'One record for every client',
    text: 'Individuals and companies, their contacts and every matter they are connected to, in one searchable place.',
    points: [
      'Individual and corporate clients',
      'Contacts, location and status on the record',
      'Find anyone by name, company, contact or email',
    ],
  },
  {
    id: 'hearings',
    label: 'Hearings',
    icon: Gavel,
    image: '/features/hearings.webp',
    path: 'hearings',
    title: 'Court dates the whole team can see',
    text: 'Record the court, judge, courtroom, date and outcome on the matter. Everyone sees the same date, and reminders go out before the day.',
    points: [
      'Court, judge, courtroom and assigned lawyer',
      'A shared calendar of hearings and appointments',
      'Email reminders, plus WhatsApp on Professional and above',
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FolderLock,
    image: '/features/documents.webp',
    path: 'documents',
    title: 'Files kept with the case they belong to',
    text: 'Contracts, filings and evidence live against the matter in private storage, so finding a document never means searching someone’s inbox.',
    points: [
      'Documents filed on the matter',
      'Private storage with role-based access',
      'View PDFs and images without downloading',
    ],
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: Banknote,
    image: '/features/billing.webp',
    path: 'billing',
    title: 'From time entry to payment received',
    text: 'Log time and expenses, turn unbilled work into numbered invoices and record payments, with earned, collected and owed always in view.',
    points: [
      'Time entries, expenses and invoices together',
      'Unbilled work, invoiced, collected and outstanding',
      'Naira billing today, built for firms across Africa',
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    image: '/features/reports.webp',
    path: 'reports',
    title: 'Reports a partner can act on',
    text: 'Financial, productivity, matter and client reports that are already there when you need them, filtered by date, lawyer, client or practice area.',
    points: [
      'Collection rate, outstanding and revenue views',
      'Productivity by lawyer',
      'Export to Excel in one click',
    ],
  },
  {
    id: 'ai',
    label: 'AI assistant',
    icon: Sparkles,
    image: '/features/ai.webp',
    path: 'assistant',
    title: 'An assistant that knows your firm',
    text: 'Ask about your own hearings, tasks and appointments in plain language, or have a matter summarised. Available on qualifying plans.',
    points: [
      '“What hearings do I have this week?”',
      'Summaries of a specific matter',
      'A fast first look: always check the details that matter',
    ],
  },
]

const MORE: { title: string; text: string; image: string; icon: LucideIcon }[] = [
  {
    title: 'Tasks with owners and deadlines',
    text: 'Assign work to a named person, tie it to a matter, set a priority and a due date.',
    image: '/features/tasks.webp',
    icon: CheckCircle2,
  },
  {
    title: 'Team messaging next to the work',
    text: 'Firm channels and direct messages live beside your matters, not in five separate chat groups.',
    image: '/features/messages.webp',
    icon: Users,
  },
  {
    title: 'People and leave in one system',
    text: 'Staff records, departments, leave and HR requests in a workspace that sits beside your cases.',
    image: '/features/hr.webp',
    icon: Building2,
  },
]

const INCLUDED: { icon: LucideIcon; label: string }[] = [
  { icon: KeyRound, label: 'Roles and permissions' },
  { icon: Building2, label: 'Branches for multi-office firms' },
  { icon: History, label: 'Audit log of every action' },
  { icon: ShieldCheck, label: 'Each firm’s data isolated' },
  { icon: FileSpreadsheet, label: 'Excel export' },
  { icon: CalendarDays, label: 'Shared firm calendar' },
  { icon: Bell, label: 'Notifications and reminders' },
]

function BrowserFrame({ src, path, alt }: { src: string; path: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e5736b]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e6b84f]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#6cc07a]" />
        <span className="ml-3 truncate rounded-md bg-background px-3 py-1 text-[11px] text-muted-foreground">
          thecounsels.org / {path}
        </span>
      </div>
      <img src={src} alt={alt} width={1280} height={800} className="block h-auto w-full" />
    </div>
  )
}

function Explorer() {
  const [active, setActive] = useState(TABS[0].id)
  const reduce = useReducedMotion()
  const tab = TABS.find((t) => t.id === active) ?? TABS[0]

  return (
    <section className="mx-auto max-w-6xl px-6 pb-20">
      <div
        role="tablist"
        aria-label="Parts of The Counsel"
        className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            onClick={() => setActive(t.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all',
              t.id === active
                ? 'border-primary bg-primary text-primary-foreground shadow-gold'
                : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid items-center gap-10 lg:grid-cols-[5fr_7fr] lg:gap-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab.id + '-text'}
            role="tabpanel"
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <tab.icon className="h-6 w-6" />
            </span>
            <MaskWords as="h2" text={tab.title} className="mt-5 font-display text-3xl font-semibold leading-tight" />
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">{tab.text}</p>
            <ul className="mt-6 space-y-3">
              {tab.points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm sm:text-base">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" /> {p}
                </li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab.id + '-img'}
            initial={reduce ? false : { opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35 }}
          >
            <BrowserFrame src={tab.image} path={tab.path} alt={`${tab.label} screen in The Counsel (sample data)`} />
            <p className="mt-3 text-center text-xs text-muted-foreground">Sample data from a demo firm.</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

/** Features overview at /features. */
export function FeaturesPage() {
  const reduce = useReducedMotion()
  useSeo({
    title: 'Features: Legal Practice Management for Law Firms | The Counsel',
    description:
      'See The Counsel in action: matters, clients, hearings, documents, billing, reports and an AI assistant in one workspace for law firms across Africa.',
    canonicalPath: '/features',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-12 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Inside the product</p>
          <MaskWords as="h1" play text="See how your firm would run on The Counsel" className="mt-3 font-display text-[2.1rem] font-semibold sm:text-5xl lg:text-6xl leading-[1.08]" />
          <Rise as="p" delay={0.35} className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Pick a part of your practice below and look at the real screen, not a mock-up.
          </Rise>
        </section>

        <Explorer />

        <section className="border-y border-border bg-card/50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Around the cases</p>
              <MaskWords as="h2" text="The rest of the practice, in the same place" className="mt-3 font-display text-3xl font-semibold sm:text-4xl" />
            </div>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {MORE.map((m, i) => (
                <motion.article
                  key={m.title}
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
                >
                  <img
                    src={m.image}
                    alt={`${m.title} (sample data)`}
                    width={1280}
                    height={800}
                    loading="lazy"
                    className="block h-auto w-full border-b border-border"
                  />
                  <div className="p-6">
                    <h3 className="font-display text-xl font-semibold">{m.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
                  </div>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20 text-center">
          <MaskWords as="h2" text="Built for the whole firm, not just the partners" className="font-display text-2xl font-semibold sm:text-3xl" />
          <ul className="mt-8 flex flex-wrap justify-center gap-3">
            {INCLUDED.map((i) => (
              <li
                key={i.label}
                className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm"
              >
                <i.icon className="h-4 w-4 text-primary" /> {i.label}
              </li>
            ))}
          </ul>
        </section>

        <SeoCtaBand heading="See it working for your firm" />
      </main>

      <SiteFooter />
    </div>
  )
}
