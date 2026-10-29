import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { EXPO } from '@/features/landing/components/motion-kit'

const SEEN_KEY = 'counsel.arrived'
const MARK = '/brand/counsel-symbol-gold.svg'

/** Whether the arrival should play: once per browser session, never with reduced motion. */
export function useArrival() {
  const reduce = useReducedMotion()
  const [arrived, setArrived] = React.useState(() => {
    try {
      return Boolean(sessionStorage.getItem(SEEN_KEY))
    } catch {
      return true
    }
  })
  const done = React.useCallback(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode */
    }
    setArrived(true)
  }, [])
  return { show: !arrived && !reduce, arrived: arrived || Boolean(reduce), done }
}

/**
 * First-visit intro: the two halves of the gold mark slide together, the
 * mark gives a small press, then the ivory panel lifts away to reveal the
 * page (the hero starts rising while it lifts — `onLift`).
 */
export function Arrival({ onLift, onDone }: { onLift: () => void; onDone: () => void }) {
  const [phase, setPhase] = React.useState<'join' | 'press' | 'lift'>('join')

  React.useEffect(() => {
    const t1 = setTimeout(() => setPhase('press'), 750)
    const t2 = setTimeout(() => {
      setPhase('lift')
      onLift()
    }, 1250)
    const t3 = setTimeout(onDone, 2150)
    document.body.style.overflow = 'hidden'
    return () => {
      ;[t1, t2, t3].forEach(clearTimeout)
      document.body.style.overflow = ''
    }
  }, [onLift, onDone])

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
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      initial={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      animate={phase === 'lift' ? { clipPath: 'polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)' } : undefined}
      transition={{ duration: 0.9, ease: [0.87, 0, 0.13, 1] }}
    >
      <motion.div
        className="relative h-20 w-20 sm:h-24 sm:w-24"
        animate={phase === 'press' ? { scale: [1, 0.92, 1] } : phase === 'lift' ? { y: -60, opacity: 0 } : undefined}
        transition={phase === 'press' ? { duration: 0.5, times: [0, 0.35, 1], ease: 'easeOut' } : { duration: 0.5, ease: 'easeIn' }}
      >
        {half('l')}
        {half('r')}
      </motion.div>
    </motion.div>
  )
}
