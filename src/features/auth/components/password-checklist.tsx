import { Check, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

// Mirrors selfRegisterSchema's actual rules (schemas.ts) exactly — this is
// a display of the real requirements, not a separate/looser set of rules.
const RULES = [
  { test: (v: string) => v.length >= 10, label: 'Must be 10 characters or more' },
  { test: (v: string) => /[0-9]/.test(v), label: 'Must include at least one number' },
  { test: (v: string) => /[a-z]/.test(v), label: 'Must include at least one lowercase letter' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'Must include at least one uppercase letter' },
]

/** Live checklist against the password's actual validation rules — shown once the user starts typing. */
export function PasswordChecklist({ value }: { value: string }) {
  if (!value) return null
  return (
    <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3">
      {RULES.map((rule) => {
        const ok = rule.test(value)
        return (
          <p key={rule.label} className={cn('flex items-center gap-1.5 text-xs', ok ? 'text-success' : 'text-muted-foreground')}>
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
            {rule.label}
          </p>
        )
      })}
    </div>
  )
}
