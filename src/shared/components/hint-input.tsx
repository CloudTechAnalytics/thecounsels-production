import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Input, type InputProps } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/utils'

/** An Input with a small trailing hint — either a short text glyph (e.g. "A-Z") or an icon. */
export const HintInput = React.forwardRef<
  HTMLInputElement,
  InputProps & { hint?: string; hintIcon?: LucideIcon }
>(({ hint, hintIcon: Icon, className, ...props }, ref) => (
  <div className="relative">
    <Input ref={ref} className={cn('pr-9', className)} {...props} />
    {(hint || Icon) && (
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {Icon ? <Icon className="h-4 w-4" /> : <span className="text-xs">{hint}</span>}
      </span>
    )}
  </div>
))
HintInput.displayName = 'HintInput'
