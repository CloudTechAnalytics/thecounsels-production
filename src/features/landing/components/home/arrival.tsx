import * as React from 'react'
import { motion } from 'framer-motion'
import { EXPO } from '@/features/landing/components/motion-kit'
import { isLoaderLifted, liftLoader } from '@/features/landing/components/loader-store'

const MARK = '/brand/counsel-symbol-gold.svg'
const MIN_MS = 1100        // never flash past; long enough to read
const HOLD_AT = 90         // the count waits here until the page has really loaded
const MAX_MS = 3000        // ...but a slow connection never keeps anyone here longer than this

/** Resolves once fonts and every image already in the page have loaded (or failed). */
function pageReady(): Promise<void> {
  const load = document.readyState === 'complete' ? Promise.resolve() : new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true }))
  const fonts = document.fonts?.ready.then(() => undefined) ?? Promise.resolve()
  return Promise.all([load, fonts]).then(() => undefined)
}

/**
 * Loading screen for the marketing site, shown on every full load/refresh:
 * the two halves of the gold mark slide together, a count runs 0–100% with a
 * thin gold bar beneath, the mark gives a small press, and the ivory panel
 * lifts away to reveal the page. The count tracks real loading (fonts and
 * images); it eases toward 90% and only finishes once the page is ready.
 */
export function MarketingLoader() {
  // never in the prerendered HTML: a page without JavaScript must not sit behind a loader
  const [show] = React.useState(() => !import.meta.env.SSR && !isLoaderLifted())
  const [pct, setPct] = React.useState(0)
  const [phase, setPhase] = React.useState<'load' | 'press' | 'lift' | 'gone'>('load')

  React.useEffect(() => {
    if (!show) return
    document.body.style.overflow = 'hidden'
    let ready = false
    let raf = 0
    let value = 0
    const start = performance.now()
    pageReady().then(() => {
      ready = true
    })
    const cap = setTimeout(() => {
      ready = true
    }, MAX_MS)
    const tick = (now: number) => {
      const elapsed = now - start
      // time-based floor so the count always moves, real readiness to finish
      const target = ready && elapsed > MIN_MS ? 100 : Math.min(HOLD_AT, (elapsed / MIN_MS) * HOLD_AT)
      value += (target - value) * (target === 100 ? 0.18 : 0.12)
      if (target === 100 && value > 99.5) value = 100
      setPct(Math.floor(value))
      if (value < 100) raf = requestAnimationFrame(tick)
      else {
        setPhase('press')
        setTimeout(() => {
          setPhase('lift')
          liftLoader() // the page starts rising while the panel lifts
        }, 380)
        setTimeout(() => {
          setPhase('gone')
          document.body.style.overflow = ''
        }, 1300)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(cap)
      document.body.style.overflow = ''
    }
  }, [show])

  if (!show || phase === 'gone') return null

  const half = (side: 'l' | 'r') => (
    <motion.span
      className="absolute inset-0 block"
      style={{ clipPath: side === 'l' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)' }}
      initial={{ x: side === 'l' ? '-46%' : '46%', opacity: 0 }}
      animate={{ x: '0%', opacity: 1 }}
      transition={{ duration: 0.7, ease: EXPO }}
    >
      <img src={MARK} alt="" className="h-full w-full" />
    </motion.span>
  )

  return (
    <motion.div
      role="progressbar"
      aria-label="Loading The Counsel"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
      initial={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      animate={phase === 'lift' ? { clipPath: 'polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)' } : undefined}
      transition={{ duration: 0.9, ease: [0.87, 0, 0.13, 1] }}
    >
      <motion.div
        className="flex flex-col items-center"
        animate={phase === 'lift' ? { y: -60, opacity: 0 } : undefined}
        transition={{ duration: 0.5, ease: 'easeIn' }}
      >
        <motion.div
          className="relative h-20 w-20 sm:h-24 sm:w-24"
          animate={phase === 'press' ? { scale: [1, 0.92, 1] } : undefined}
          transition={{ duration: 0.38, times: [0, 0.4, 1], ease: 'easeOut' }}
        >
          {half('l')}
          {half('r')}
        </motion.div>

        <p className="mt-8 font-display text-4xl font-semibold lining-nums tabular-nums text-foreground sm:text-5xl">
          {pct}
          <span className="text-primary">%</span>
        </p>
        <div className="mt-4 h-[3px] w-40 overflow-hidden rounded-full bg-border sm:w-52">
          <div className="h-full origin-left rounded-full bg-primary" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">The Counsel</p>
      </motion.div>
    </motion.div>
  )
}
