import * as React from 'react'
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion'
import { Banknote } from 'lucide-react'
import { Eyebrow, MaskLines, Rise } from '@/features/landing/components/motion-kit'
import { cn } from '@/shared/lib/utils'

const STOPS = [
  { title: 'Time logged', text: 'Against the matter, as the work happens' },
  { title: 'Invoice drafted', text: 'Unbilled work swept in, numbered' },
  { title: 'Sent to client', text: 'Reviewed, then out the door' },
  { title: 'Payment recorded', text: 'Status updates as money lands' },
  { title: 'Reports updated', text: 'Partners see it the same day' },
]

/**
 * The billing chain as a track: scroll and the marker travels from
 * "Time logged" to "Reports updated", filling the rail and lighting each
 * stop as it passes. Horizontal on desktop, vertical on phones.
 */
export function CollectionsTrack() {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] })
  const p = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  const prog = reduce ? scrollYProgress : p
  const pct = useTransform(prog, (v) => `${(reduce ? 1 : v) * 100}%`)
  const scale = useTransform(prog, (v) => (reduce ? 1 : v))
  const [reached, setReached] = React.useState(reduce ? STOPS.length : 0)
  useMotionValueEvent(prog, 'change', (v) => {
    if (!reduce) setReached(STOPS.filter((_, i) => v >= i / (STOPS.length - 1) - 0.02).length)
  })

  return (
    <section className="relative overflow-hidden border-t border-border bg-primary/[0.04]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
          <div>
            <Eyebrow>Billing</Eyebrow>
            <MaskLines className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-6xl" lines={['From courtroom', 'to collections.']} />
          </div>
          <Rise delay={0.15}>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg lg:ml-auto">
              A logged hour becomes an invoice, and an invoice becomes insight. Nothing re-typed into a separate billing spreadsheet.
            </p>
          </Rise>
        </div>

        <div ref={ref} className="mt-14 lg:mt-20">
          {/* desktop: horizontal rail */}
          <div className="relative hidden lg:block">
            <div className="absolute left-[10%] right-[10%] top-[22px] h-[3px] rounded-full bg-border">
              <motion.div className="h-full origin-left rounded-full bg-primary" style={{ scaleX: scale }} />
              <motion.span
                className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-gold"
                style={{ left: pct }}
              >
                <Banknote className="h-5 w-5" />
              </motion.span>
            </div>
            <ol className="relative grid grid-cols-5">
              {STOPS.map((s, i) => (
                <li key={s.title} className="flex flex-col items-center px-2 text-center">
                  <span className={cn('mt-[15px] h-4 w-4 rounded-full border-2 transition-colors duration-300', i < reached ? 'border-primary bg-primary' : 'border-border bg-background')} />
                  <p className={cn('mt-6 font-display text-lg font-semibold transition-colors duration-300', i < reached ? 'text-foreground' : 'text-muted-foreground/60')}>{s.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>

          {/* phones: vertical rail */}
          <div className="relative pl-12 lg:hidden">
            <div className="absolute bottom-3 left-[19px] top-3 w-[3px] rounded-full bg-border">
              <motion.div className="h-full w-full origin-top rounded-full bg-primary" style={{ scaleY: scale }} />
            </div>
            <ol className="space-y-8">
              {STOPS.map((s, i) => (
                <li key={s.title} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[37px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors duration-300',
                      i < reached ? 'border-primary bg-primary' : 'border-border bg-background',
                    )}
                  />
                  <p className={cn('font-display text-xl font-semibold transition-colors duration-300', i < reached ? 'text-foreground' : 'text-muted-foreground/60')}>{s.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
