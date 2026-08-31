import { Link, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/shared/components/theme-toggle'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  Scale,
  Briefcase,
  Banknote,
  Gavel,
  FolderLock,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Clock,
  CheckCircle2,
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
import { cn } from '@/shared/lib/utils'
import { useAuth } from '@/features/auth/context/auth-provider'
import { CounselMark } from '@/shared/components/counsel-mark'

const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'
const CONTACT_PHONE_DISPLAY = '+234 813 386 0143'
const CONTACT_PHONE_TEL = '+2348133860143'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

/** Section wrapper that reveals its children as they scroll into view. */
function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
    >
      {children}
    </motion.div>
  )
}

const STATS = [
  { value: '6', label: 'Purpose-built modules, working as one workspace' },
  { value: '₦', label: 'Native naira billing & invoicing' },
  { value: 'Row-level', label: 'Security isolating every firm’s data by default' },
  { value: '30-day', label: 'Free trial on any plan, no card required' },
]

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

const STEPS = [
  {
    icon: Clock,
    title: 'Capture the work',
    text: 'Lawyers log time, hearings, tasks and documents against matters as the day happens.',
  },
  {
    icon: Banknote,
    title: 'Bill without friction',
    text: 'Finance sweeps unbilled work into invoices in seconds and records payments as they land.',
  },
  {
    icon: Sparkles,
    title: 'See the whole firm',
    text: 'Partners get live dashboards, risk insights and exportable reports. No spreadsheet stitching.',
  },
]

// Mirrors the plans table (migration 0053) — keep in sync if pricing changes
// there. Public pricing isn't queried live here since anonymous visitors
// can't read `plans` under RLS, and we don't weaken RLS to expose it.
const PLANS = [
  {
    key: 'starter',
    name: 'Basic',
    price: '₦15,000',
    tagline: 'For solo lawyers and small law firms',
    features: ['Up to 3 users', 'Core matter & client management', 'Documents, hearings & calendar', 'Time tracking & expenses', 'Basic billing & reports'],
  },
  {
    key: 'professional',
    name: 'Professional',
    price: '₦50,000',
    tagline: 'For growing and established law firms',
    features: ['Up to 10 users', 'Everything in Basic', 'Advanced tasks & notifications', 'Email + WhatsApp reminders', 'Advanced billing & reports'],
    highlight: true,
  },
  {
    key: 'business',
    name: 'Business',
    price: '₦100,000',
    tagline: 'For larger law firms',
    features: ['Up to 25 users', 'Everything in Professional', 'Advanced analytics', 'Workflow automation', 'Advanced firm controls'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    tagline: 'Tailored pricing — talk to sales',
    features: ['Custom users & storage', 'Custom features & workflows', 'Custom integrations', 'Custom support requirements'],
  },
]

/** Landing-page plan buttons lead toward payment, not another trial CTA —
 * "Start Free"/"Start Free Trial" already exist in the nav and hero for
 * that. Clicking a paid tier here stashes the intent so the onboarding
 * wizard's plan step preselects it (instead of defaulting to Trial),
 * surviving the account-creation + email-verification gap in between —
 * a query param wouldn't (Supabase's verification link redirects to a
 * fixed callback URL). Cleared once the wizard reads it. */
const INTENDED_PLAN_KEY = 'counsel.intended_plan'

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

/** The Counsel emblem: a firm seal — scales of justice ringed by the practice. */
const ORBIT = [
  { icon: Briefcase, label: 'Matters' },
  { icon: Gavel, label: 'Hearings' },
  { icon: FolderLock, label: 'Documents' },
  { icon: Banknote, label: 'Billing' },
  { icon: BarChart3, label: 'Reports' },
  { icon: ShieldCheck, label: 'Security' },
]

function HeroEmblem() {
  const reduce = useReducedMotion()
  const spin = 56 // seconds per revolution

  return (
    <div
      className="relative mx-auto flex aspect-square w-[min(84vw,430px)] items-center justify-center"
      aria-hidden
    >
      {/* concentric seal rings */}
      <div className="absolute inset-0 rounded-full border border-dashed border-primary/30" />
      <div className="absolute inset-[13%] rounded-full border border-primary/15" />
      <div className="absolute inset-[26%] rounded-full border border-foreground/10 bg-foreground/[0.03]" />

      {/* orbiting practice modules (counter-rotated to stay upright) */}
      <motion.div
        className="absolute inset-0"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: spin, repeat: Infinity, ease: 'linear' }}
      >
        {ORBIT.map((o, i) => {
          const angle = (i / ORBIT.length) * 2 * Math.PI - Math.PI / 2
          const x = 50 + Math.cos(angle) * 44
          const y = 50 + Math.sin(angle) * 44
          return (
            <div
              key={o.label}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <motion.div
                animate={reduce ? undefined : { rotate: -360 }}
                transition={{ duration: spin, repeat: Infinity, ease: 'linear' }}
                className="flex flex-col items-center gap-1"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/40 bg-background text-primary shadow-elevated sm:h-12 sm:w-12 sm:rounded-xl">
                  <o.icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                </span>
                <span className="text-[7px] font-medium uppercase tracking-wider text-foreground/40 sm:text-[10px]">
                  {o.label}
                </span>
              </motion.div>
            </div>
          )
        })}
      </motion.div>

      {/* golden center — the scales */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-[30%] w-[30%] flex-col items-center justify-center rounded-full bg-gradient-to-b from-primary to-[#8a6428] p-2 text-center text-primary-foreground shadow-gold"
      >
        <Scale className="h-[26%] w-[26%]" strokeWidth={1.25} />
        <p className="mt-[6%] font-display text-[10px] font-semibold leading-tight tracking-wide sm:text-sm">
          {APP.product}
        </p>
        <p className="text-[5px] uppercase leading-tight tracking-[0.18em] opacity-80 sm:text-[9px] sm:tracking-[0.22em]">
          Est. one firm · one system
        </p>
      </motion.div>
    </div>
  )
}

const PREVIEW_NAV = ['Dashboard', 'Matters', 'Clients', 'Hearings', 'Billing', 'Reports']
const PREVIEW_STATS = ['Active matters', 'Hearings this week', 'Revenue this month']

/** An illustrated mockup of the real dashboard's actual layout (sidebar,
 * stat tiles, recent-activity list) — hand-built to match the app's own
 * look, not a literal screenshot standing in for one. */
function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
          <span className="ml-3 flex-1 truncate rounded-md bg-background px-3 py-1 text-[10px] text-muted-foreground">
            app.{APP.domain}/dashboard
          </span>
        </div>
        <div className="flex h-72 sm:h-80">
          <div className="hidden w-36 shrink-0 border-r border-border bg-sidebar p-3 sm:block">
            <div className="mb-4 flex items-center gap-2 px-1">
              <CounselMark variant="small" className="h-6 w-6" />
              <span className="text-[10px] font-semibold text-sidebar-foreground">{APP.product}</span>
            </div>
            <div className="space-y-1">
              {PREVIEW_NAV.map((label, i) => (
                <div
                  key={label}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-[10px]',
                    i === 0 ? 'bg-sidebar-hover font-medium text-sidebar-foreground' : 'text-sidebar-muted',
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-hidden bg-background p-4">
            <div>
              <p className="font-display text-sm font-semibold">Welcome back</p>
              <p className="text-[10px] text-muted-foreground">Here's what's happening at your firm today.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PREVIEW_STATS.map((label) => (
                <div key={label} className="rounded-lg border border-border bg-card p-2.5">
                  <p className="text-[9px] leading-tight text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-base font-semibold text-primary">••</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recently updated matters
              </p>
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-5 w-5 shrink-0 rounded-full bg-primary/15" />
                    <span className="h-1.5 flex-1 rounded-full bg-muted" style={{ opacity: 1 - i * 0.15 }} />
                    <span className="h-4 w-10 shrink-0 rounded-full bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="absolute -bottom-6 -left-6 hidden items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-elevated sm:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/12 text-success">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] font-semibold">Invoice paid</p>
          <p className="text-[9px] text-muted-foreground">₦450,000 received</p>
        </div>
      </motion.div>
    </div>
  )
}

export function LandingPage() {
  const reduce = useReducedMotion()
  const year = new Date().getFullYear()
  const navigate = useNavigate()
  const { status, signOut } = useAuth()

  const goToLogin = async () => {
    // A stale session must never bounce this click straight to the dashboard —
    // landing-page "Log in" always lands on the login form.
    if (status === 'authenticated') await signOut()
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <CounselMark className="h-9 w-9" />
            <p className="font-display text-lg font-semibold text-foreground">{APP.product}</p>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Products
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Solutions
            </a>
            <a href="#faq" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Resources
            </a>
            <a href="#contact" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Contacts
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              size="sm"
              variant="outline"
              className="border-border bg-transparent text-foreground hover:bg-accent hover:text-foreground"
              onClick={goToLogin}
            >
              Log in
            </Button>
            <Button asChild size="sm" className="shadow-gold">
              <Link to="/auth/register">Start Free</Link>
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-background pb-24 pt-36 text-foreground">
        {/* judicial backdrop: crisp watermark scales + gold hairlines */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <Scale
            className="absolute -bottom-24 -left-28 h-[30rem] w-[30rem] text-primary/[0.055]"
            strokeWidth={0.5}
          />
          <Gavel
            className="absolute -right-16 -top-10 h-72 w-72 rotate-12 text-primary/[0.05]"
            strokeWidth={0.5}
          />
          {/* fine columns of gold hairlines, like a courthouse colonnade */}
          <div className="absolute inset-y-0 left-1/2 hidden w-px bg-gradient-to-b from-transparent via-primary/15 to-transparent lg:block" />
          <div className="absolute inset-y-0 left-[8%] w-px bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
          <div className="absolute inset-y-0 right-[8%] w-px bg-gradient-to-b from-transparent via-primary/10 to-transparent" />
          {/* hairline base rule */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.p
              variants={fadeUp}
              className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-foreground/50"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" /> {APP.brand}
            </motion.p>
            <motion.h1
              variants={fadeUp}
              className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-[3.4rem]"
            >
              Run Your
              <br />
              <span className="text-primary">Law Firm</span>
              <br />
              with Confidence.
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              No task, deadline, or follow-up should ever get buried in someone's inbox or a
              spreadsheet. The Counsel keeps every matter, from first filing to final invoice,
              visible, assigned, and on schedule.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" variant="outline" className="border-border bg-transparent text-foreground hover:bg-accent hover:text-foreground">
                <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`}>Book a Demo</a>
              </Button>
              <Button asChild size="lg" className="shadow-gold">
                <Link to="/auth/register">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-6 text-xs text-foreground/35">
              30 days free, no card required. Set up your firm in minutes.
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroEmblem />
          </motion.div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────── */}
      <section className="border-b border-border bg-card/40">
        <Reveal className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 sm:grid-cols-4">
          {STATS.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="text-center sm:text-left">
              <p className="font-display text-3xl font-semibold text-primary sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{s.label}</p>
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* ── Mission statement ───────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-20 text-center">
        <Reveal>
          <motion.p variants={fadeUp} className="font-display text-2xl font-medium leading-snug text-foreground sm:text-3xl">
            Legal work is detail work. The Counsel exists so your team spends that care on cases,
            not on spreadsheets, shared drives, and missed filing dates.
          </motion.p>
        </Reveal>
      </section>

      {/* ── Product preview ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <Reveal className="grid items-center gap-14 lg:grid-cols-2">
          <motion.div variants={fadeUp}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">See it in action</p>
            <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              Everything your firm needs, at a glance
            </h2>
            <p className="mt-4 text-muted-foreground">
              Open your dashboard and see what matters the moment you log in: active matters,
              this week's hearings, revenue, and every client's latest activity. No spreadsheets
              to reconcile, no separate tools to check.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Role-aware dashboards for partners, associates and finance',
                'Live activity across every matter your team touches',
                'One-click Excel exports for anything you see',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div variants={fadeUp}>
            <DashboardPreview />
          </motion.div>
        </Reveal>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Everything a firm runs on
          </motion.p>
          <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            One workspace. The whole practice.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
            Purpose-built modules that talk to each other, so a logged hour becomes an invoice,
            and an invoice becomes insight.
          </motion.p>
        </Reveal>

        <Reveal className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              whileHover={reduce ? undefined : { y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="group rounded-xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/12 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section id="how-it-works" className="border-y border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              How it works
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              From courtroom to collections
            </motion.h2>
          </Reveal>
          <Reveal className="mt-14 grid gap-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div key={s.title} variants={fadeUp} className="relative text-center md:text-left">
                <div className="mb-4 flex items-center justify-center gap-3 md:justify-start">
                  <span className="font-display text-5xl font-semibold text-primary/25">0{i + 1}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <s.icon className="h-5 w-5" />
                  </span>
                </div>
                <h3 className="font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </motion.div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Solutions for every size ─────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Solutions
          </motion.p>
          <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Built for every kind of practice
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
            From a single-desk practice to a multi-partner chambers, the same system scales with you.
          </motion.p>
        </Reveal>

        <Reveal className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SEGMENTS.map((s) => (
            <motion.div
              key={s.title}
              variants={fadeUp}
              whileHover={reduce ? undefined : { y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="rounded-xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* ── Trust ─────────────────────────────────────────────── */}
      <section className="border-y border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Trusted beyond the software
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              We stay with you after launch
            </motion.h2>
          </Reveal>

          <Reveal className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((t) => (
              <motion.div key={t.title} variants={fadeUp} className="text-center sm:text-left">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary/12 text-primary sm:mx-0">
                  <t.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.text}</p>
              </motion.div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Compliance strip ─────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <Reveal className="flex flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
          <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary sm:shrink-0">
            Built with compliance in mind
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 sm:justify-end">
            {COMPLIANCE.map((c) => (
              <span key={c.label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <c.icon className="h-4 w-4 shrink-0 text-primary" /> {c.label}
              </span>
            ))}
          </motion.div>
        </Reveal>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Pricing
          </motion.p>
          <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Simple plans, per firm
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-4 text-muted-foreground">
            Start free for 30 days. No payment required.
          </motion.p>
        </Reveal>

        <Reveal className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p) => (
            <motion.div
              key={p.name}
              variants={fadeUp}
              whileHover={reduce ? undefined : { y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className={cn(
                'relative flex flex-col rounded-xl border bg-card p-7 shadow-card',
                p.highlight ? 'border-primary shadow-gold' : 'border-border',
              )}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
                  Recommended
                </span>
              )}
              <h3 className="font-display text-xl font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-5">
                <span className="font-display text-4xl font-semibold">{p.price}</span>
                {p.price !== 'Custom' && <span className="text-sm text-muted-foreground"> /month</span>}
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              {p.name === 'Enterprise' ? (
                <Button asChild className="mt-7" variant="outline">
                  <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — Enterprise plan`}>Contact sales</a>
                </Button>
              ) : (
                <Button asChild className="mt-7" variant={p.highlight ? 'default' : 'outline'}>
                  <Link to="/auth/register" onClick={() => localStorage.setItem(INTENDED_PLAN_KEY, p.key)}>
                    Get Started
                  </Link>
                </Button>
              )}
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="border-y border-border bg-card/60">
        <div className="mx-auto max-w-3xl px-6 py-24">
          <Reveal className="mx-auto max-w-2xl text-center">
            <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Resources
            </motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
              Frequently asked questions
            </motion.h2>
          </Reveal>

          <Reveal className="mt-12 space-y-3">
            {FAQS.map((f) => (
              <motion.details
                key={f.q}
                variants={fadeUp}
                className="group rounded-xl border border-border bg-card p-5 open:shadow-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold marker:content-none">
                  {f.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
              </motion.details>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CTA band / Contact ──────────────────────────────── */}
      <section id="contact" className="relative overflow-hidden border-t border-border bg-background text-foreground">
        <Reveal className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <motion.p variants={fadeUp} className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Contact
          </motion.p>
          <motion.h2 variants={fadeUp} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Ready to run a modern practice?
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Join the firms replacing scattered spreadsheets and shared drives with one elegant,
            secure workspace.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="shadow-gold">
              <Link to="/auth/register">
                Start Free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-border bg-transparent text-foreground hover:bg-accent hover:text-foreground">
              <Link to="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-foreground hover:bg-accent hover:text-foreground">
              <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`}>Talk to our team</a>
            </Button>
          </motion.div>
          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-foreground/50"
          >
            <a href={`mailto:${CONTACT_EMAIL}`} className="transition-colors hover:text-primary">
              {CONTACT_EMAIL}
            </a>
            <span className="hidden text-foreground/20 sm:inline">•</span>
            <a href={`tel:${CONTACT_PHONE_TEL}`} className="transition-colors hover:text-primary">
              {CONTACT_PHONE_DISPLAY}
            </a>
          </motion.div>
        </Reveal>
      </section>

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
                  <a href="#pricing" className="transition-colors hover:text-primary">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#faq" className="transition-colors hover:text-primary">
                    FAQ
                  </a>
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
