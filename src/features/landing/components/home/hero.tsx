import * as React from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Bell, CheckCircle2, Smartphone } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { APP } from '@/shared/config/env'
import { Depth, DepthScope, EXPO, MaskLines, Rise } from '@/features/landing/components/motion-kit'
import { PhoneMock } from '@/features/landing/components/home/phone-mock'
import { BrowserFrame } from '@/features/landing/components/home/day-in-chambers'
import { useInstallAction } from '@/shared/components/install-app'

const PROOF = [
  ['6', 'modules, one workspace'],
  ['₦', 'billing built for Africa'],
  ['30', 'days free, no card'],
]

/**
 * Opening section. Headline lines rise from a mask, the phone swings up
 * into place, the floating cards pop in and then drift against the
 * pointer; the whole stage eases upward as you scroll away.
 * `play` holds everything until the arrival intro lifts.
 */
export function Hero({ play, contactEmail }: { play: boolean; contactEmail: string }) {
  const reduce = useReducedMotion()
  const getApp = useInstallAction()
  const ref = React.useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const stageY = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '-10%'])
  const seamX = useTransform(scrollYProgress, [0, 1], ['0%', reduce ? '0%' : '8%'])
  const pop = (delay: number) => ({
    initial: reduce ? false : { scale: 0.82, opacity: 0 },
    animate: play || reduce ? { scale: 1, opacity: 1 } : { scale: 0.82, opacity: 0 },
    transition: { duration: 0.9, ease: EXPO, delay },
  })

  return (
    <section ref={ref} className="relative overflow-hidden">
      {/* angled ivory-gold seam behind the phone */}
      <motion.div
        aria-hidden
        style={{ x: seamX, clipPath: 'polygon(22% 0, 100% 0, 100% 100%, 0 100%)' }}
        className="pointer-events-none absolute bottom-0 right-[-8%] top-[42%] w-[116%] bg-primary/[0.07] lg:top-0 lg:w-[54%]"
      />

      <DepthScope className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 sm:px-6 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[1fr_1.15fr] lg:pb-20 lg:pt-6">
        <div>
          <Rise play={play} y={12}>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{APP.brand}</p>
          </Rise>
          <MaskLines
            as="h1"
            play={play}
            className="font-display text-[3.1rem] font-semibold leading-[0.98] tracking-[-0.02em] sm:text-7xl lg:text-[5.4rem]"
            lines={['Run your', <span className="text-primary">law firm</span>, 'with confidence.']}
          />
          <Rise play={play} delay={0.45}>
            <p className="mt-7 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
              No task, deadline, or follow-up should ever get buried in someone's inbox or a spreadsheet. The Counsel keeps every matter, from first
              filing to final invoice, visible, assigned, and on schedule.
            </p>
          </Rise>
          <Rise play={play} delay={0.55}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button asChild size="lg" className="rounded-full shadow-gold">
                <Link to="/auth/register">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-border bg-transparent text-foreground hover:bg-accent hover:text-foreground">
                <a href={`mailto:${contactEmail}?subject=The Counsel — demo request`}>Book a Demo</a>
              </Button>
            </div>
            {getApp.available && (
              <button
                type="button"
                onClick={getApp.start}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground underline decoration-primary/50 underline-offset-4 transition-colors hover:text-primary"
              >
                <Smartphone className="h-4 w-4 text-primary" /> Get the app on your phone
              </button>
            )}
            {getApp.dialog}
          </Rise>
          <ul className="mt-10 grid max-w-lg grid-cols-3 border-t border-border">
            {PROOF.map(([n, l], i) => (
              <motion.li
                key={l}
                className="border-r border-border pr-3 pt-4 last:border-r-0 [&:not(:first-child)]:pl-4"
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={play || reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ duration: 0.7, ease: EXPO, delay: 0.9 + i * 0.07 }}
              >
                <p className="font-display text-2xl font-semibold lining-nums text-primary">{n}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{l}</p>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* desktop browser with the real dashboard, the phone app standing in front of it */}
        <motion.div style={{ y: stageY }} className="relative mx-auto w-full max-w-[640px] pb-24 pt-4 sm:pb-28 lg:pb-20">
          <motion.div
            initial={reduce ? false : { y: 80, opacity: 0, scale: 0.96 }}
            animate={play || reduce ? { y: 0, opacity: 1, scale: 1 } : { y: 80, opacity: 0, scale: 0.96 }}
            transition={{ duration: 1.3, ease: EXPO, delay: 0.05 }}
          >
            <Depth depth={0.15}>
              <BrowserFrame path="dashboard">
                <img src="/features/dashboard.webp" alt="The Counsel dashboard on desktop" className="absolute inset-0 h-full w-full object-cover object-left-top" />
              </BrowserFrame>
            </Depth>
          </motion.div>

          <motion.div
            className="absolute bottom-0 right-[-1%] sm:right-[-3%] lg:right-[-7%]"
            initial={reduce ? false : { y: 140, rotate: 14, opacity: 0 }}
            animate={play || reduce ? { y: 0, rotate: 0, opacity: 1 } : { y: 140, rotate: 14, opacity: 0 }}
            transition={{ duration: 1.4, ease: EXPO, delay: 0.3 }}
          >
            <Depth depth={0.45}>
              {/* the mock is drawn at real phone size; scaled down to sit in front of the browser */}
              <div className="h-[300px] w-[150px] sm:h-[395px] sm:w-[186px]">
                <div className="origin-top-left scale-[0.5] sm:scale-[0.62]">
                  <PhoneMock />
                </div>
              </div>
            </Depth>
          </motion.div>

          <motion.div {...pop(0.85)} className="absolute -left-2 top-[-2%] sm:-left-8">
            <Depth depth={1}>
              <div className="flex w-[210px] items-center gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-elevated">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(216_14%_13%)] text-sidebar-accent">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[12px] font-semibold">Hearing tomorrow, 9:00</p>
                  <p className="text-[11px] text-muted-foreground">Reminder sent to 4 people</p>
                </div>
              </div>
            </Depth>
          </motion.div>

          <motion.div {...pop(1)} className="absolute bottom-[6%] left-[2%] sm:-left-6">
            <Depth depth={1.4}>
              <div className="flex w-[190px] items-center gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-elevated">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[12px] font-semibold">Invoice paid</p>
                  <p className="text-[11px] text-muted-foreground">₦450,000 received</p>
                </div>
              </div>
            </Depth>
          </motion.div>
        </motion.div>
      </DepthScope>
    </section>
  )
}
