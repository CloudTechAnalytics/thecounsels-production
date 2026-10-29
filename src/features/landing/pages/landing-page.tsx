import { Link, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  Briefcase,
  Banknote,
  Gavel,
  FolderLock,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  ChevronDown,
  User,
  Users,
  TrendingUp,
  Building2,
  PhoneCall,
  UploadCloud,
  ClipboardCheck,
  Lock,
  ScrollText,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { APP } from '@/shared/config/env'
import { useAuth } from '@/features/auth/context/auth-provider'
import { CounselMark } from '@/shared/components/counsel-mark'
import { AfricaReach, AFRICA_TOTAL } from '@/features/landing/components/africa-reach'
import { SiteHeader } from '@/features/landing/components/site-header'
import { EXPO, Eyebrow, MaskLines, NightSection, Odometer, Rise, Stagger, StaggerItem } from '@/features/landing/components/motion-kit'
import { useLoaderLifted } from '@/features/landing/components/loader-store'
import { Hero } from '@/features/landing/components/home/hero'
import { OldWay } from '@/features/landing/components/home/old-way'
import { DayInChambers } from '@/features/landing/components/home/day-in-chambers'
import { FeaturesFan } from '@/features/landing/components/home/features-fan'
import { CollectionsTrack } from '@/features/landing/components/home/collections-track'

const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'
const CONTACT_PHONE_DISPLAY = '+234 813 386 0143'
const CONTACT_PHONE_TEL = '+2348133860143'

const SEGMENTS = [
  {
    icon: User,
    title: 'Solo practitioners',
    text: 'One hub for every hat: track matters, bill clients and manage hearings without the overhead of a team.',
  },
  {
    icon: Users,
    title: 'Small chambers',
    text: 'Get organised as you grow, with a shared calendar, a shared client base, and one source of truth for every matter.',
  },
  {
    icon: TrendingUp,
    title: 'Growing firms',
    text: 'Billing, permissions and reporting that scale with headcount, so more staff doesn’t mean more chaos.',
  },
  {
    icon: Building2,
    title: 'Enterprise chambers',
    text: 'Multi-partner visibility, granular role permissions, and firm-wide reporting for chambers running at scale.',
  },
]

const TRUST = [
  {
    icon: ShieldCheck,
    title: 'Security',
    text: 'Row-level tenant isolation, role-based permissions and an audit log on every action. Your data is scoped to your firm, and no one else’s.',
  },
  {
    icon: PhoneCall,
    title: 'Real support',
    text: 'Reach a real person by email or phone when you need help, not a ticket queue that goes quiet.',
  },
  {
    icon: UploadCloud,
    title: 'Onboarding & migration',
    text: 'Our team helps you move matters, clients and documents in, so you start with a workspace that already reflects your practice.',
  },
  {
    icon: ClipboardCheck,
    title: 'Guided provisioning',
    text: 'Accounts, roles and permissions are set up by our team before your first login, so there’s no self-serve setup to get wrong.',
  },
]

const FEATURES = [
  {
    icon: Briefcase,
    title: 'Matters & case tracking',
    text: 'Every engagement numbered, statused and timelined, from first instruction to judgment, with a full audit trail.',
  },
  {
    icon: Banknote,
    title: 'Billing & invoicing',
    text: 'Log time and disbursements, sweep unbilled work into numbered invoices, and reconcile payments in naira.',
  },
  {
    icon: Gavel,
    title: 'Hearings & calendar',
    text: 'Court dates, mentions and rulings on one calendar, with reminders before anything falls through.',
  },
  {
    icon: FolderLock,
    title: 'Document vault',
    text: 'Contracts, orders and evidence stored per matter in encrypted, access-controlled storage. Preview in-app.',
  },
  {
    icon: BarChart3,
    title: 'Reports & insights',
    text: 'Collections, productivity and workload balance, plus one-click Excel exports your partners will actually read.',
  },
  {
    icon: ShieldCheck,
    title: 'Enterprise security',
    text: 'Row-level tenant isolation, role-based permissions, and an audit log on every action. Your data is yours.',
  },
]

const COMPLIANCE = [
  { icon: ShieldCheck, label: 'Row-level tenant isolation' },
  { icon: Lock, label: 'Encrypted document storage' },
  { icon: ClipboardCheck, label: 'Full audit trail on every action' },
  { icon: ScrollText, label: 'Designed with NDPR principles in mind' },
]

const FAQS = [
  {
    q: 'Who can create an account?',
    a: 'Anyone. Start a free trial in a few minutes from the "Start Free" button above. You create your firm, become its Managing Partner, and invite your team from inside the app. No sales call required.',
  },
  {
    q: 'Is our data secure?',
    a: 'Every firm’s data is isolated with row-level security, access is role-based, and every action is captured in an audit log.',
  },
  {
    q: 'Can we bring in our existing matters and clients?',
    a: 'Our onboarding team helps you migrate matters, clients and documents when you get started, so you’re not starting from a blank workspace.',
  },
  {
    q: 'Does billing work in naira?',
    a: 'Yes. Time, disbursements and invoices are tracked and billed in naira by default.',
  },
  {
    q: 'Can we change plans later?',
    a: 'Yes. Your Managing Partner can upgrade, downgrade or subscribe any time from Firm Settings. Upgrades apply immediately; downgrades take effect on your next billing date.',
  },
]

/** What a firm leaves behind when it moves in. Struck through as the list scrolls into view. */
const LEFT_BEHIND = ['Spreadsheets nobody trusts', 'Shared drives with four versions of everything', 'Hearing dates in a group chat']

function StruckList() {
  const reduce = useReducedMotion()
  return (
    <ul className="mt-8 space-y-3">
      {LEFT_BEHIND.map((t, i) => (
        <li key={t} className="relative w-fit text-base text-muted-foreground sm:text-lg">
          {t}
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-[2px] w-full origin-left bg-primary"
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, ease: [0.87, 0, 0.13, 1], delay: 0.3 + i * 0.25 }}
          />
        </li>
      ))}
    </ul>
  )
}

export function LandingPage() {
  const year = new Date().getFullYear()
  const navigate = useNavigate()
  const { status, signOut } = useAuth()
  const play = useLoaderLifted()

  const goToLogin = async () => {
    // A stale session must never bounce this click straight to the dashboard —
    // landing-page "Log in" always lands on the login form.
    if (status === 'authenticated') await signOut()
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <SiteHeader />

      <main>
        <Hero play={play} contactEmail={CONTACT_EMAIL} />

        <OldWay />

        <DayInChambers />

        <FeaturesFan features={FEATURES} />

        <CollectionsTrack />

        {/* ── Solutions + numbers (night) ─────────────────────── */}
        <NightSection id="solutions" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <Eyebrow className="text-sidebar-accent">Solutions</Eyebrow>
                <MaskLines className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-6xl" lines={['Built for every', 'kind of practice.']} />
              </div>
              <Rise delay={0.15}>
                <p className="max-w-md text-base text-sidebar-muted sm:text-lg lg:ml-auto">
                  From a single-desk practice to a multi-partner chambers, the same system scales with you.
                </p>
              </Rise>
            </div>

            <Stagger className="mt-14 grid border-t border-sidebar-border sm:grid-cols-2 lg:grid-cols-4">
              {SEGMENTS.map((s) => (
                <StaggerItem key={s.title} className="border-b border-sidebar-border py-7 sm:pr-6 lg:border-b-0 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0">
                  <s.icon className="h-5 w-5 text-sidebar-accent" />
                  <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-sidebar-muted">{s.text}</p>
                </StaggerItem>
              ))}
            </Stagger>

            <div className="mt-16 grid grid-cols-2 gap-y-10 border-t border-sidebar-border pt-12 lg:grid-cols-4">
              {[
                { v: '6', unit: 'modules', label: 'Working as one workspace' },
                { v: '30', unit: 'days', label: 'Free trial on any plan, no card required' },
                { v: String(AFRICA_TOTAL), unit: 'countries', label: 'Firms across Africa can sign up today' },
                { v: '1', unit: 'workspace', label: 'Row-level security isolating every firm' },
              ].map((s) => (
                <div key={s.unit} className="pr-4">
                  <p className="font-display text-5xl font-semibold text-sidebar-foreground sm:text-6xl">
                    <Odometer value={s.v} />
                    <span className="ml-1 text-base font-medium text-sidebar-accent">{s.unit}</span>
                  </p>
                  <p className="mt-2 max-w-[220px] text-sm text-sidebar-muted">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </NightSection>

        <AfricaReach />

        {/* ── Trust ─────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr] lg:py-28">
            <div>
              <Eyebrow>Trusted beyond the software</Eyebrow>
              <MaskLines className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-5xl" lines={['We stay with you', 'after launch.']} />
              <StruckList />
            </div>
            <Stagger className="grid gap-x-10 sm:grid-cols-2">
              {TRUST.map((t) => (
                <StaggerItem key={t.title} className="border-t border-border py-6">
                  <t.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-3 font-display text-lg font-semibold">{t.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
          <div className="border-t border-border">
            <Rise className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary lg:shrink-0">Built with compliance in mind</p>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {COMPLIANCE.map((c) => (
                  <span key={c.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <c.icon className="h-4 w-4 shrink-0 text-primary" /> {c.label}
                  </span>
                ))}
              </div>
            </Rise>
          </div>
        </section>

        {/* ── FAQ ─────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-16 border-t border-border bg-primary/[0.04]">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:py-28">
            <div>
              <Eyebrow>Resources</Eyebrow>
              <MaskLines className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-5xl" lines={['Frequently asked', 'questions.']} />
            </div>
            <Stagger className="border-t border-border">
              {FAQS.map((f) => (
                <StaggerItem key={f.q}>
                  <details className="group border-b border-border py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold marker:content-none">
                      {f.q}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border transition-colors group-open:border-primary group-open:bg-primary group-open:text-primary-foreground">
                        <ChevronDown className="h-4 w-4 transition-transform duration-300 group-open:rotate-180" />
                      </span>
                    </summary>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{f.a}</p>
                  </details>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ── Closing CTA / Contact ───────────────────────────── */}
        <section id="contact" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto max-w-4xl px-5 py-24 text-center sm:px-6 lg:py-32">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: [0.8, 1.06, 1], opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: EXPO }}
            >
              <CounselMark className="mx-auto h-16 w-16 sm:h-20 sm:w-20" />
            </motion.div>
            <MaskLines
              className="mt-8 font-display text-5xl font-semibold leading-[0.98] tracking-[-0.02em] sm:text-7xl lg:text-8xl"
              lines={['Ready to run a', <span className="text-primary">modern practice?</span>]}
            />
            <Rise delay={0.25}>
              <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
                Join the firms replacing scattered spreadsheets and shared drives with one elegant, secure workspace.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
                <Button asChild size="lg" className="rounded-full shadow-gold">
                  <Link to="/auth/register">
                    Start Free <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-border bg-transparent text-foreground hover:bg-accent hover:text-foreground" onClick={goToLogin}>
                  Sign in
                </Button>
                <Button asChild size="lg" variant="ghost" className="rounded-full text-foreground hover:bg-accent hover:text-foreground">
                  <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`}>Talk to our team</a>
                </Button>
              </div>
              <div className="mt-8 flex flex-col items-center justify-center gap-x-6 gap-y-2 text-sm text-foreground/50 sm:flex-row">
                <a href={`mailto:${CONTACT_EMAIL}`} className="break-all transition-colors hover:text-primary">
                  {CONTACT_EMAIL}
                </a>
                <span className="hidden text-foreground/20 sm:inline">•</span>
                <a href={`tel:${CONTACT_PHONE_TEL}`} className="transition-colors hover:text-primary">
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </div>
            </Rise>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border bg-background py-16 text-foreground">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5">
                <CounselMark variant="small" className="h-8 w-8" />
                <div className="leading-tight">
                  <p className="font-display font-semibold">{APP.product}</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{APP.brand}</p>
                </div>
              </div>
              <p className="mt-4 max-w-[220px] text-sm leading-relaxed text-muted-foreground">
                One secure workspace for matters, billing, hearings, documents and reports.
                Built for modern law firms.
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Product</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="transition-colors hover:text-primary">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="transition-colors hover:text-primary">
                    How it works
                  </a>
                </li>
                <li>
                  <Link to="/pricing" className="transition-colors hover:text-primary">
                    Pricing
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="transition-colors hover:text-primary">
                    FAQ
                  </a>
                </li>
                <li>
                  <Link to="/legal-practice-management-software-africa" className="transition-colors hover:text-primary">
                    Legal Practice Management
                  </Link>
                </li>
                <li>
                  <Link to="/law-firm-management-software" className="transition-colors hover:text-primary">
                    Law Firm Management
                  </Link>
                </li>
                <li>
                  <Link to="/legal-case-management-software" className="transition-colors hover:text-primary">
                    Case Management
                  </Link>
                </li>
                <li>
                  <Link to="/law-firm-billing-software" className="transition-colors hover:text-primary">
                    Billing &amp; Invoicing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Company</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <a href="#contact" className="transition-colors hover:text-primary">
                    Contact
                  </a>
                </li>
                <li>
                  <Link to="/auth/register" className="transition-colors hover:text-primary">
                    Start free
                  </Link>
                </li>
                <li>
                  <button type="button" onClick={goToLogin} className="transition-colors hover:text-primary">
                    Log in
                  </button>
                </li>
                <li>
                  <a
                    href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`}
                    className="transition-colors hover:text-primary"
                  >
                    Book a demo
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Get in touch</p>
              <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
                <li>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-primary">
                    {CONTACT_EMAIL}
                  </a>
                </li>
                <li>
                  <a href={`tel:${CONTACT_PHONE_TEL}`} className="transition-colors hover:text-primary">
                    {CONTACT_PHONE_DISPLAY}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row">
            <p>
              © {year} {APP.brand}. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="/terms" className="transition-colors hover:text-primary">Terms &amp; Conditions</a>
              <a href="/privacy" className="transition-colors hover:text-primary">Privacy Policy</a>
            </div>
            <p>Built for firms practicing across Africa.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
