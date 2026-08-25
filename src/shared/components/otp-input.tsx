import * as React from 'react'
import { cn } from '@/shared/lib/utils'

/**
 * A `length`-digit numeric code entry — one box per digit, auto-advancing,
 * with paste support (pasting the whole code fills every box at once, the
 * common case when copying a code straight out of an email client). Fully
 * controlled: the parent owns `value` and decides when it's complete.
 */
export function OtpInput({
  length,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
}: {
  length: number
  value: string
  onChange: (value: string) => void
  /** Fires once, exactly when the value reaches `length` digits. */
  onComplete?: (value: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([])
  const firedCompleteRef = React.useRef(false)

  React.useEffect(() => {
    if (value.length === length && !firedCompleteRef.current) {
      firedCompleteRef.current = true
      onComplete?.(value)
    }
    if (value.length < length) firedCompleteRef.current = false
  }, [value, length, onComplete])

  const setDigit = (index: number, digit: string) => {
    const next = value.split('')
    next[index] = digit
    onChange(next.join('').slice(0, length))
  }

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, '')
    if (!digits) {
      setDigit(index, '')
      return
    }
    if (digits.length > 1) {
      // A paste landed in a single box — distribute across the rest.
      const next = (value.slice(0, index) + digits).slice(0, length)
      onChange(next)
      const lastFilled = Math.min(index + digits.length, length) - 1
      refs.current[lastFilled]?.focus()
      return
    }
    setDigit(index, digits)
    if (index < length - 1) refs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      refs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault()
      refs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    e.preventDefault()
    const next = (value.slice(0, index) + digits).slice(0, length)
    onChange(next)
    const lastFilled = Math.min(index + digits.length, length) - 1
    refs.current[lastFilled]?.focus()
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="Verification code">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={value[i] ?? ''}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            'h-12 w-9 rounded-md border border-input bg-card text-center text-lg font-semibold shadow-sm transition-colors sm:w-10',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        />
      ))}
    </div>
  )
}
