import * as React from 'react'
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from 'framer-motion'
import { cn } from '@/shared/lib/utils'

/*
 * Motion vocabulary for the marketing site: lines that rise out of a mask,
 * content that settles up as it arrives, rolling odometer digits, pointer
 * depth and angled "night" sections. Long expo-out easing throughout, so
 * things arrive fast and settle slowly. Every piece renders its final state
 * immediately when the visitor prefers reduced motion.
 */

/** expo.out — quick start, long soft landing. */
export const EXPO = [0.16, 1, 0.3, 1] as const

type Tag = 'h1' | 'h2' | 'h3' | 'p' | 'div' | 'span'

const lineVariants: Variants = {
  hidden: { y: '112%' },
  show: (i: number) => ({ y: '0%', transition: { duration: 1.15, ease: EXPO, delay: i } }),
}

/**
 * Headline whose lines rise one after another from behind a mask. Pass
 * explicit lines (for hand-set display type). `play` lets a parent hold the
 * entrance (e.g. until the arrival intro lifts); otherwise it plays on view.
 */
export function MaskLines({
  lines,
  as = 'h2',
  className,
  lineClassName,
  delay = 0,
  stagger = 0.12,
  play,
}: {
  lines: React.ReactNode[]
  as?: Tag
  className?: string
  lineClassName?: string
  delay?: number
  stagger?: number
  play?: boolean
}) {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const go = play ?? inView
  const Comp = motion[as] as typeof motion.div
  return (
    <Comp ref={ref as React.Ref<HTMLDivElement>} className={className} initial={reduce ? 'show' : 'hidden'} animate={go || reduce ? 'show' : 'hidden'}>
      {lines.map((line, i) => (
        // pb/-mb keep descenders (g, y, p) inside the mask
        <span key={i} className="block overflow-hidden pb-[0.12em] -mb-[0.12em]">
          <motion.span className={cn('block', lineClassName)} variants={lineVariants} custom={delay + i * stagger}>
            {line}
          </motion.span>
        </span>
      ))}
    </Comp>
  )
}

/** Same rise-from-mask, word by word, for headings whose line breaks we don't control (SEO pages, long titles). */
export function MaskWords({ text, as = 'h2', className, delay = 0, play }: { text: string; as?: Tag; className?: string; delay?: number; play?: boolean }) {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const go = play ?? inView
  const Comp = motion[as] as typeof motion.div
  const words = text.split(' ')
  return (
    <Comp ref={ref as React.Ref<HTMLDivElement>} className={className} initial={reduce ? 'show' : 'hidden'} animate={go || reduce ? 'show' : 'hidden'} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
          <motion.span className="inline-block" variants={lineVariants} custom={delay + i * 0.045}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </Comp>
  )
}

/** Settles up into place as it scrolls into view. */
export function Rise({
  children,
  className,
  delay = 0,
  y = 24,
  as = 'div',
  play,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  y?: number
  as?: Tag
  play?: boolean
}) {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const go = play ?? inView
  const Comp = motion[as] as typeof motion.div
  return (
    <Comp
      ref={ref as React.Ref<HTMLDivElement>}
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={go || reduce ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.9, ease: EXPO, delay }}
    >
      {children}
    </Comp>
  )
}

const staggerParent: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } }
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.85, ease: EXPO } },
}

/** A grid/list whose children (StaggerItem) arrive one after another. */
export function Stagger({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'ul' | 'ol' }) {
  const reduce = useReducedMotion()
  const Comp = motion[as] as typeof motion.div
  return (
    <Comp className={className} variants={staggerParent} initial={reduce ? 'show' : 'hidden'} whileInView="show" viewport={{ once: true, margin: '-60px' }}>
      {children}
    </Comp>
  )
}

export function StaggerItem({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'li' | 'article' }) {
  const Comp = motion[as] as typeof motion.div
  return (
    <Comp className={className} variants={staggerChild}>
      {children}
    </Comp>
  )
}

/**
 * Digits roll into place on vertical strips, like a mechanical counter.
 * Non-digit characters (₦, %, :, letters) sit still beside them.
 */
export function Odometer({ value, className, play }: { value: string; className?: string; play?: boolean }) {
  const reduce = useReducedMotion()
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const go = reduce || (play ?? inView)
  const chars = value.split('')
  let d = 0
  return (
    <span ref={ref} className={cn('inline-flex lining-nums tabular-nums', className)}>
      <span className="sr-only">{value}</span>
      {chars.map((c, i) => {
        if (!/\d/.test(c)) return <span key={i} aria-hidden>{c}</span>
        const n = Number(c)
        const order = d++
        return (
          <span key={i} aria-hidden className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15em]">
            <motion.span
              className="flex flex-col"
              initial={false}
              animate={{ y: go ? `${-1.15 * n}em` : '0em' }}
              transition={{ duration: reduce ? 0 : 1.4, ease: EXPO, delay: reduce ? 0 : order * 0.08 }}
            >
              {Array.from({ length: 10 }, (_, k) => (
                <span key={k} className="block h-[1.15em]">
                  {k}
                </span>
              ))}
            </motion.span>
          </span>
        )
      })}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * Pointer depth: floating pieces drift against the cursor, nearer ones more.
 * ------------------------------------------------------------------------- */
const DepthCtx = React.createContext<{ x: MotionValue<number>; y: MotionValue<number> } | null>(null)

/** Wrap an area (the hero) so its <Depth> children follow the pointer. Touch screens get no drift. */
export function DepthScope({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const x = useSpring(rx, { stiffness: 60, damping: 18 })
  const y = useSpring(ry, { stiffness: 60, damping: 18 })
  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse') return
    rx.set(e.clientX / window.innerWidth - 0.5)
    ry.set(e.clientY / window.innerHeight - 0.5)
  }
  return (
    <DepthCtx.Provider value={{ x, y }}>
      <div className={className} onPointerMove={onMove}>
        {children}
      </div>
    </DepthCtx.Provider>
  )
}

export function Depth({ depth = 0.5, children, className }: { depth?: number; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(DepthCtx)
  const zero = useMotionValue(0)
  const x = useTransform(ctx?.x ?? zero, (v) => v * 36 * depth)
  const y = useTransform(ctx?.y ?? zero, (v) => v * 28 * depth)
  return (
    <motion.div className={className} style={{ x, y }}>
      {children}
    </motion.div>
  )
}

/**
 * Dark section in the app's own charcoal (the sidebar colour), with angled
 * top/bottom edges cutting into its neighbours. `data-night` tells the header
 * to switch to its dark treatment while it sits over this section.
 */
export function NightSection({ children, className, id, edges = 'both' }: { children: React.ReactNode; className?: string; id?: string; edges?: 'both' | 'top' | 'bottom' | 'none' }) {
  const top = edges === 'both' || edges === 'top' ? '3.5vw' : '0'
  const bottom = edges === 'both' || edges === 'bottom' ? 'calc(100% - 3.5vw)' : '100%'
  return (
    <section
      id={id}
      data-night
      className={cn('relative bg-sidebar text-sidebar-foreground', edges !== 'none' && 'py-[3.5vw]', className)}
      style={{ clipPath: `polygon(0 ${top}, 100% 0, 100% ${bottom}, 0 100%)` }}
    >
      {children}
    </section>
  )
}

/** Small uppercase label above a heading. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-xs font-semibold uppercase tracking-[0.2em] text-primary', className)}>{children}</p>
}

/**
 * Drop-in wrapper for an existing grid or list: its direct children settle up
 * one after another when it scrolls into view (CSS-driven, see .stagger-grid in
 * globals.css), so pages don't need to wrap every card in a motion element.
 */
export function StaggerGrid({ children, className, as = 'div' }: { children: React.ReactNode; className?: string; as?: 'div' | 'ul' | 'ol' }) {
  const ref = React.useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const Comp = as as 'div'
  return (
    <Comp ref={ref as React.Ref<HTMLDivElement>} className={cn('stagger-grid', inView && 'is-in', className)}>
      {children}
    </Comp>
  )
}
