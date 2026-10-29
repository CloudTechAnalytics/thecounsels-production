import * as React from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { Bell, Check } from 'lucide-react'
import { CounselMark } from '@/shared/components/counsel-mark'
import { EXPO, Eyebrow, MaskLines, Rise } from '@/features/landing/components/motion-kit'
import { cn } from '@/shared/lib/utils'

const THREAD: { who: string; text: string; time: string; me?: boolean }[] = [
  { who: 'Tunde', text: 'Is the shipping hearing today or tomorrow??', time: '07:52' },
  { who: 'Amaka', text: 'I thought it was Thursday', time: '07:55' },
  { who: 'You', text: 'Who has the hearing notice?', time: '07:58', me: true },
  { who: 'Daniel', text: 'check the registry email', time: '08:04' },
  { who: 'Tunde', text: 'which email??', time: '08:05' },
]

/**
 * "The old way": a chambers group chat plays out message by message, a gold
 * strike cuts through it, it fades back, and The Counsel's hearing reminder
 * rises in its place. Plays once, when the thread scrolls into view.
 */
export function OldWay() {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -28% 0px' })
  const go = inView || Boolean(reduce)
  const strikeAt = THREAD.length * 0.3 + 0.35
  // After the strike lands, the old thread falls back behind the reminder.
  const [dim, setDim] = React.useState(false)
  React.useEffect(() => {
    if (!go) return
    if (reduce) return setDim(true)
    const t = setTimeout(() => setDim(true), (strikeAt + 0.2) * 1000)
    return () => clearTimeout(t)
  }, [go, reduce, strikeAt])

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:py-28">
      <div>
        <Eyebrow>Why The Counsel</Eyebrow>
        <MaskLines
          className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-6xl"
          lines={['Legal work is', 'detail work.']}
        />
        <Rise delay={0.2}>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            The Counsel exists so your team spends that care on cases, not on spreadsheets, shared drives, group chats and missed filing dates.
          </p>
          <ul className="mt-8 max-w-md divide-y divide-border border-y border-border text-sm">
            {['Every hearing on one calendar', 'Reminders by email and WhatsApp, a day ahead', 'Everyone on the matter, notified'].map((t) => (
              <li key={t} className="flex items-center gap-3 py-3">
                <Check className="h-4 w-4 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </Rise>
      </div>

      <div ref={ref} className="relative mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">CS</span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Chambers · all staff</p>
              <p className="text-xs text-muted-foreground">Group chat · 52 unread</p>
            </div>
          </div>
          <div className="relative space-y-2.5 px-5 py-5">
            {THREAD.map((m, i) => (
              <motion.div
                key={i}
                className={cn('flex', m.me && 'justify-end')}
                initial={reduce ? false : { opacity: 0, y: 16, scale: 0.94 }}
                animate={go ? { opacity: dim ? 0.22 : 1, y: 0, scale: 1 } : undefined}
                transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EXPO, delay: dim ? 0 : i * 0.3 }}
                style={{ transformOrigin: 'bottom center' }}
              >
                <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.me ? 'rounded-br-md bg-[hsl(216_14%_13%)] text-sidebar-foreground' : 'rounded-bl-md bg-muted')}>
                  {!m.me && <p className="text-[11px] font-semibold text-primary">{m.who}</p>}
                  <p>{m.text}</p>
                  <p className={cn('mt-0.5 text-right text-[10px]', m.me ? 'text-sidebar-muted' : 'text-muted-foreground')}>{m.time}</p>
                </div>
              </motion.div>
            ))}

            {/* the strike */}
            <motion.span
              aria-hidden
              className="absolute left-4 right-4 top-1/2 h-[3px] rounded-full bg-primary"
              style={{ rotate: -14, transformOrigin: 'left center' }}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }}
              animate={go ? { scaleX: 1, opacity: 1 } : undefined}
              transition={{ duration: reduce ? 0 : 0.55, ease: [0.87, 0, 0.13, 1], delay: reduce ? 0 : strikeAt }}
            />
          </div>
        </div>

        {/* what replaces it */}
        <motion.div
          className="relative z-10 mx-4 -mt-24 rounded-2xl border border-primary/30 bg-card p-4 shadow-elevated sm:mx-8"
          initial={reduce ? false : { y: 40, opacity: 0 }}
          animate={go ? { y: 0, opacity: 1 } : undefined}
          transition={{ duration: reduce ? 0 : 0.9, ease: EXPO, delay: reduce ? 0 : strikeAt + 0.3 }}
        >
          <div className="flex items-start gap-3">
            <CounselMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Bell className="h-3.5 w-3.5 text-primary" /> Hearing tomorrow, 9:00 AM
              </p>
              <p className="text-xs text-muted-foreground">Cargo Loss Dispute · Federal High Court · Court 4</p>
              <motion.div
                className="mt-2.5 flex flex-wrap gap-1.5"
                initial={reduce ? false : { opacity: 0, scale: 0.8 }}
                animate={go ? { opacity: 1, scale: 1 } : undefined}
                transition={{ duration: reduce ? 0 : 0.6, ease: EXPO, delay: reduce ? 0 : strikeAt + 0.8 }}
              >
                {['Email sent', 'WhatsApp sent', '4 people notified'].map((c) => (
                  <span key={c} className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">
                    <Check className="h-3 w-3" /> {c}
                  </span>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
