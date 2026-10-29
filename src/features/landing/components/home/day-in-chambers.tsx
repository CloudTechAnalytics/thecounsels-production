import * as React from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { APP } from '@/shared/config/env'
import { EXPO, Eyebrow, MaskLines, Odometer, Rise } from '@/features/landing/components/motion-kit'
import { cn } from '@/shared/lib/utils'

const DAY = [
  {
    time: '08:30',
    title: 'Open the day.',
    text: "See what matters the moment you log in: active matters, this week's hearings, revenue, and every client's latest activity.",
    img: 'dashboard',
    path: 'dashboard',
  },
  {
    time: '10:15',
    title: 'Capture the work.',
    text: 'Lawyers log time, hearings, tasks and documents against matters as the day happens.',
    img: 'matters',
    path: 'matters',
  },
  {
    time: '13:00',
    title: 'Never miss a court date.',
    text: 'Court dates, mentions and rulings on one calendar, with reminders before anything falls through.',
    img: 'hearings',
    path: 'hearings',
  },
  {
    time: '16:40',
    title: 'Bill without friction.',
    text: 'Finance sweeps unbilled work into invoices in seconds and records payments as they land.',
    img: 'billing',
    path: 'billing',
  },
  {
    time: '19:00',
    title: 'See the whole firm.',
    text: 'Partners get live dashboards, risk insights and exportable reports. No spreadsheet stitching.',
    img: 'reports',
    path: 'reports',
  },
]

/** How far through a working day (08:00–20:00) a time is, for the day line. */
const dayFraction = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return Math.min(1, Math.max(0.04, (h * 60 + m - 480) / 720))
}

function BrowserFrame({ path, children, className }: { path: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-elevated', className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
        <span className="ml-3 flex-1 truncate rounded-md bg-background px-3 py-1 text-[10px] text-muted-foreground">
          {APP.domain}/{path}
        </span>
      </div>
      <div className="relative aspect-[16/10] bg-background">{children}</div>
    </div>
  )
}

/** One step of the story on desktop; reports when it reaches the middle of the screen. */
function Step({ i, active, onActive }: { i: number; active: boolean; onActive: (i: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' })
  React.useEffect(() => {
    if (inView) onActive(i)
  }, [inView, i, onActive])
  const s = DAY[i]
  return (
    <div ref={ref} className="flex min-h-[72vh] items-center">
      <div className={cn('transition-opacity duration-500', active ? 'opacity-100' : 'opacity-30')}>
        <p className="font-display text-sm font-semibold lining-nums tabular-nums text-primary">{s.time}</p>
        <h3 className="mt-2 font-display text-3xl font-semibold leading-tight">{s.title}</h3>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{s.text}</p>
      </div>
    </div>
  )
}

/**
 * "A day in chambers" — scroll-told. On desktop the clock and the app
 * window stay pinned while the steps scroll past: the clock's digits roll
 * to each step's time, the day line grows, and the next real screen wipes
 * up over the last. On phones it becomes a simple stack: time, words, screen.
 */
export function DayInChambers() {
  const reduce = useReducedMotion()
  const [active, setActive] = React.useState(0)
  const onActive = React.useCallback((i: number) => setActive(i), [])
  const time = DAY[active].time

  return (
    <section id="how-it-works" className="relative scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-5 pt-20 sm:px-6 lg:pt-28">
        <Eyebrow>How it works</Eyebrow>
        <MaskLines className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-6xl" lines={['A day in chambers,', 'on one system.']} />
        <Rise delay={0.15}>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">From courtroom to collections. Here's how a working day moves through The Counsel.</p>
        </Rise>
      </div>

      {/* Desktop: pinned clock + window, scrolling steps */}
      <div className="mx-auto hidden max-w-6xl grid-cols-[150px_minmax(0,1fr)_300px] gap-10 px-6 pb-16 lg:grid">
        <div className="relative">
          <div className="sticky top-[calc(50vh-90px)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Monday</p>
            <Odometer value={time} play className="mt-1 font-display text-5xl font-semibold" />
            <div className="mt-5 h-40 w-[3px] overflow-hidden rounded-full bg-border">
              <motion.div
                className="h-full w-full origin-top bg-primary"
                animate={{ scaleY: dayFraction(time) }}
                transition={{ duration: reduce ? 0 : 0.9, ease: EXPO }}
              />
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="sticky top-[calc(50vh-210px)] py-2">
            <BrowserFrame path={DAY[active].path}>
              {DAY.map((s, k) => (
                <motion.img
                  key={s.img}
                  src={`/features/${s.img}.webp`}
                  alt={`${s.title.replace('.', '')}: The Counsel ${s.img} screen`}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover object-left-top"
                  style={{ zIndex: k }}
                  initial={false}
                  animate={k <= active ? { clipPath: 'inset(0% 0 0 0)', scale: 1 } : { clipPath: 'inset(100% 0 0 0)', scale: 1.04 }}
                  transition={{ duration: reduce ? 0 : 0.95, ease: EXPO }}
                />
              ))}
            </BrowserFrame>
          </div>
        </div>

        <div className="pb-[20vh]">
          {DAY.map((_, i) => (
            <Step key={i} i={i} active={i === active} onActive={onActive} />
          ))}
        </div>
      </div>

      {/* Phones: one block per step */}
      <div className="mx-auto max-w-xl space-y-14 px-5 pb-20 pt-12 lg:hidden">
        {DAY.map((s) => (
          <Rise key={s.time}>
            <BrowserFrame path={s.path}>
              <img src={`/features/${s.img}.webp`} alt={`The Counsel ${s.img} screen`} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-left-top" />
            </BrowserFrame>
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <Odometer value={s.time} className="font-display text-lg font-semibold text-primary" />
            </div>
            <h3 className="mt-2 font-display text-2xl font-semibold">{s.title}</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{s.text}</p>
          </Rise>
        ))}
      </div>
    </section>
  )
}
