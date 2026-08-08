import * as React from 'react'
import { useReducedMotion } from 'framer-motion'

/** Animates 0 → target via requestAnimationFrame on mount/target change. Skips the animation for `prefers-reduced-motion`. */
export function useCountUp(target: number, durationMs = 700): number {
  const reduceMotion = useReducedMotion()
  const [value, setValue] = React.useState(reduceMotion ? target : 0)

  React.useEffect(() => {
    if (reduceMotion) {
      setValue(target)
      return
    }
    let frame: number
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, reduceMotion])

  return value
}
