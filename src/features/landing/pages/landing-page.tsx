import { Link } from 'react-router-dom'
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
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { APP } from '@/shared/config/env'
import { cn } from '@/shared/lib/utils'

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

const FEATURES = [
  {
    icon: Briefcase,
    title: 'Matters & case tracking',
    text: 'Every engagement numbered, statused and timelined — from first instruction to judgment, with a full audit trail.',
  },
  {
    icon: Banknote,
    title: 'Billing & invoicing',
    text: 'Log time and disbursements, sweep unbilled work into numbered invoices, and reconcile payments in naira.',
  },
  {
    icon: Gavel,
    title: 'Hearings & calendar',
    text: 'Court dates, mentions and rulings on one calendar — with reminders before anything falls through.',
  },
  {
    icon: FolderLock,
    title: 'Document vault',
    text: 'Contracts, orders and evidence stored per matter in encrypted, access-controlled storage. Preview in-app.',
  },
  {
    icon: BarChart3,
    title: 'Reports & insights',
    text: 'Collections, productivity, workload balance — plus one-click Excel exports your partners will actually read.',
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
    text: 'Partners get live dashboards, risk insights and exportable reports — no spreadsheet stitching.',
  },
]

const PLANS = [
  {
    name: 'Basic',
    price: '₦50,000',
    tagline: 'For small chambers getting organised',
    features: ['Matters, clients & calendar', 'Document vault', 'Tasks & hearings', 'Email support'],
  },
  {
    name: 'Professional',
    price: '₦100,000',
    tagline: 'For growing firms that bill seriously',
    features: ['Everything in Basic', 'Billing & invoicing', 'Reports & Excel export', 'Role-based permissions'],
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '₦250,000',
    tagline: 'For firms that run on their data',
    features: ['Everything in Professional', 'Advanced analytics', 'Priority support', 'Custom onboarding'],
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
    <div className="relative mx-auto flex h-[360px] w-[360px] items-center justify-center sm:h-[430px] sm:w-[430px]" aria-hidden>
      {/* concentric seal rings */}
      <div className="absolute inset-0 rounded-full border border-dashed border-primary/30" />
      <div className="absolute inset-[13%] rounded-full border border-primary/15" />
      <div className="absolute inset-[26%] rounded-full border border-white/10 bg-white/[0.03]" />

      {/* orbiting practice modules (counter-rotated to stay upright) */}
      <motion.div
        className="absolute inset-0"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: spin, repeat: Infinity, ease: 'linear' }}
      >
        {ORBIT.map((o, i) => {
          const angle = (i / ORBIT.length) * 2 * Math.PI - Math.PI / 2
          const x = 50 + Math.cos(angle) * 50
          const y = 50 + Math.sin(angle) * 50
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
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/40 bg-sidebar text-primary shadow-elevated">
                  <o.icon className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">{o.label}</span>
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
        className="relative flex h-44 w-44 flex-col items-center justify-center rounded-full bg-gradient-to-b from-primary to-[#8a6428] text-primary-foreground shadow-gold sm:h-52 sm:w-52"
      >
        <Scale className="h-16 w-16 sm:h-20 sm:w-20" strokeWidth={1.25} />
        <p className="mt-2 font-display text-sm font-semibold tracking-wide">{APP.product}</p>
        <p className="text-[9px] uppercase tracking-[0.22em] opacity-80">Est. one firm · one system</p>
      </motion.div>
    </div>
  )
}

export function LandingPage() {
  const reduce = useReducedMotion()
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* ── Nav ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-sidebar/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-gold">
              <Scale className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-lg font-semibold text-white">{APP.product}</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">by {APP.brand}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#pricing"
              className="hidden text-sm text-white/60 transition-colors hover:text-white sm:block"
            >
              Pricing
            </a>
            <a
              href="#features"
              className="hidden text-sm text-white/60 transition-colors hover:text-white sm:block"
            >
              Features
            </a>
            <Button asChild size="sm">
              <Link to="/auth/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </motion.header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-sidebar pb-24 pt-36 text-white">
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
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium tracking-wide text-primary"
            >
              <Sparkles className="h-3.5 w-3.5" /> {APP.tagline}
            </motion.p>
            <motion.h1
              variants={fadeUp}
              className="font-display text-4xl font-semibold leading-[1.1] sm:text-5xl lg:text-[3.4rem]"
            >
              Run a modern practice, <span className="text-primary">elegantly</span>.
            </motion.h1>
            <motion.p variants={fadeUp} className="mt-6 max-w-lg text-lg leading-relaxed text-white/60">
              Matters, hearings, documents, billing and reports — one secure workspace for your whole
              firm, built for the way legal practice actually works.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-4">
              <Button asChild size="lg" className="shadow-gold">
                <Link to="/auth/login">
                  Sign in to your workspace <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <a href="mailto:sales@cloudtech.legal?subject=The Counsel — demo request">Request a demo</a>
              </Button>
            </motion.div>
            <motion.p variants={fadeUp} className="mt-6 text-xs text-white/35">
              Firm accounts are provisioned by our team — no self-signup, no stray data.
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
            Purpose-built modules that talk to each other — so a logged hour becomes an invoice, and an
            invoice becomes insight.
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
      <section className="border-y border-border bg-card/60">
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
            Every plan starts with a 14-day Professional trial. No card required.
          </motion.p>
        </Reveal>

        <Reveal className="mt-14 grid gap-6 lg:grid-cols-3">
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
                  Most popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
              <p className="mt-5">
                <span className="font-display text-4xl font-semibold">{p.price}</span>
                <span className="text-sm text-muted-foreground"> /month</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-7" variant={p.highlight ? 'default' : 'outline'}>
                <a href={`mailto:sales@cloudtech.legal?subject=The Counsel — ${p.name} plan`}>Contact sales</a>
              </Button>
            </motion.div>
          ))}
        </Reveal>
      </section>

      {/* ── CTA band ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-sidebar text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: 'radial-gradient(40rem 20rem at 50% 120%, hsl(var(--primary) / 0.25), transparent)' }}
        />
        <Reveal className="relative mx-auto max-w-3xl px-6 py-24 text-center">
          <motion.h2 variants={fadeUp} className="font-display text-3xl font-semibold sm:text-4xl">
            Ready to run a modern practice?
          </motion.h2>
          <motion.p variants={fadeUp} className="mx-auto mt-4 max-w-xl text-white/60">
            Join the firms replacing scattered spreadsheets and shared drives with one elegant,
            secure workspace.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="shadow-gold">
              <Link to="/auth/login">
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <a href="mailto:sales@cloudtech.legal?subject=The Counsel — demo request">Talk to our team</a>
            </Button>
          </motion.div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-sidebar py-10 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Scale className="h-4 w-4" />
            </span>
            <span className="font-display font-semibold">{APP.product}</span>
            <span className="text-xs text-white/40">· {APP.brand}</span>
          </div>
          <p className="text-xs text-white/40">
            © {year} {APP.brand}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
