import * as React from 'react'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Eyebrow, MaskLines, Rise, Stagger, StaggerItem } from '@/features/landing/components/motion-kit'

const FAN = [
  { img: 'documents', side: -1 },
  { img: 'calendar', side: 1 },
  { img: 'clients', side: 0 },
]

function FanCard({ img, side, p }: { img: string; side: number; p: MotionValue<number> }) {
  const reduce = useReducedMotion()
  const x = useTransform(p, [0, 1], ['0%', `${side * 34}%`])
  const rotate = useTransform(p, [0, 1], [0, side * 7])
  const y = useTransform(p, [0, 1], [0, side ? 34 : 0])
  return (
    <motion.div
      style={reduce ? { x: `${side * 34}%`, rotate: side * 7, y: side ? 34 : 0, zIndex: side ? 1 : 2 } : { x, rotate, y, zIndex: side ? 1 : 2 }}
      className="absolute inset-x-[16%] top-0 overflow-hidden rounded-2xl border border-border bg-card shadow-elevated"
    >
      <img src={`/features/${img}.webp`} alt={`The Counsel ${img} screen`} loading="lazy" className="block aspect-[16/10] w-full object-cover object-left-top" />
    </motion.div>
  )
}

/**
 * "One workspace. The whole practice." Three real screens start stacked and
 * fan apart as the section scrolls up; the six modules follow in a ruled
 * grid that fills in one cell at a time.
 */
export function FeaturesFan({ features }: { features: { icon: LucideIcon; title: string; text: string }[] }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 90%', 'center 45%'] })

  return (
    <section id="features" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>Everything a firm runs on</Eyebrow>
          <MaskLines className="mt-4 font-display text-4xl font-semibold leading-[1.02] sm:text-6xl" lines={['One workspace.', 'The whole practice.']} />
          <Rise delay={0.15}>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Purpose-built modules that talk to each other, so a logged hour becomes an invoice, and an invoice becomes insight.
            </p>
          </Rise>
        </div>

        <div ref={ref} className="relative mx-auto mt-14 aspect-[16/8] w-full max-w-4xl sm:aspect-[16/7]">
          {FAN.map((f) => (
            <FanCard key={f.img} img={f.img} side={f.side} p={scrollYProgress} />
          ))}
        </div>

        <Stagger className="mt-16 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <StaggerItem key={f.title} className="group relative border-b border-r border-border p-6 transition-colors hover:bg-card sm:p-8">
              <div className="flex items-center justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="font-display text-sm font-semibold lining-nums tabular-nums text-muted-foreground/50">0{i + 1}</span>
              </div>
              <h3 className="mt-6 font-display text-xl font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              <span className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 bg-primary transition-transform duration-500 group-hover:scale-x-100" />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}
