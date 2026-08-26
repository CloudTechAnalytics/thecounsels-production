import { cn } from '@/shared/lib/utils'

const SRC = {
  /** Primary mark, any surface — #B38A3E. Default; use down to ~32px. */
  gold: '/brand/counsel-symbol-gold.svg',
  /** Heavier band, wider aperture, Deep Gold #8A6420 — for 16/24/32px use specifically, per the identity spec. */
  small: '/brand/counsel-symbol-small.svg',
} as const

/**
 * The real brand mark — a self-contained badge (plate + ring) with no
 * wrapping needed, unlike the old placeholder (a bare Lucide <Scale> icon
 * sunk into a separately-colored rounded-square span). Replacing a usage of
 * that old pattern means dropping the wrapper entirely, not just swapping
 * the glyph inside it — this renders its own plate.
 */
export function CounselMark({ className, variant = 'gold' }: { className?: string; variant?: keyof typeof SRC }) {
  return (
    <img
      src={SRC[variant]}
      alt=""
      aria-hidden="true"
      className={cn('block', className)}
    />
  )
}
