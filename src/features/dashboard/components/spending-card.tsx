import * as React from 'react'
import { Link } from 'react-router-dom'
import { PieChart } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useFundRequests } from '@/features/funds/hooks/use-funds'
import { fundCategoryLabel } from '@/features/funds/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatMoneyCompact, formatNaira } from '@/shared/lib/format'
import { cn } from '@/shared/lib/utils'

// Fixed categorical order (validated palette, globals.css --series-*); a 5th+
// category folds into "Other" in neutral grey rather than a generated hue.
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
const OTHER = 'hsl(var(--muted-foreground))'

/** Staff advances paid out this year, by category — the firm's operational
 * spend that never shows up on an invoice. */
export function SpendingCard({ className }: { className?: string }) {
  const { activeOrgId } = useAuth()
  const { data: requests, isLoading } = useFundRequests(activeOrgId)
  const [hover, setHover] = React.useState<string | null>(null)
  const year = String(new Date().getFullYear())

  const slices = React.useMemo(() => {
    const byCat = new Map<string, number>()
    for (const r of requests ?? []) {
      if (!r.disbursed_amount || !(r.payment_date ?? r.disbursed_at ?? '').startsWith(year)) continue
      const label = fundCategoryLabel(r.category)
      byCat.set(label, (byCat.get(label) ?? 0) + Number(r.disbursed_amount))
    }
    const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 4).map(([label, value], i) => ({ label, value, color: SERIES[i] }))
    const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0)
    return rest > 0 ? [...top, { label: 'Other', value: rest, color: OTHER }] : top
  }, [requests, year])

  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = 54
  const c = 2 * Math.PI * r
  const gap = slices.length > 1 ? 2 : 0
  let offset = 0
  const active = slices.find((s) => s.label === hover)

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><PieChart className="h-4 w-4 text-primary" /> Staff spending {year}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">Advances paid out, by category</p>
        </div>
        <Link to="/hr/retirements" className="text-xs text-primary hover:underline">Details</Link>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-44 w-full" /> : total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No advances paid out this year yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-6">
            <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0 -rotate-90" role="img" aria-label={`${formatNaira(total)} paid out this year across ${slices.length} categories`}>
              <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
              {slices.map((s) => {
                const len = (s.value / total) * c
                const el = (
                  <circle
                    key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color}
                    strokeWidth={hover === s.label ? 19 : 16}
                    strokeDasharray={`${Math.max(len - gap, 0.5)} ${c}`} strokeDashoffset={-offset}
                    className="cursor-pointer transition-[stroke-width]"
                    onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${s.label}: ${formatNaira(s.value)}`}</title>
                  </circle>
                )
                offset += len
                return el
              })}
              <g className="rotate-90" style={{ transformOrigin: '70px 70px' }}>
                <text x="70" y="68" textAnchor="middle" className="fill-foreground font-display text-[17px] font-semibold">{formatMoneyCompact(active ? active.value : total)}</text>
                <text x="70" y="85" textAnchor="middle" className="fill-muted-foreground text-[9px]">{active ? active.label : 'Total paid out'}</text>
              </g>
            </svg>
            <ul className="min-w-[160px] flex-1 space-y-2.5 text-sm">
              {slices.map((s) => (
                <li
                  key={s.label}
                  className={cn('flex items-center justify-between gap-3 rounded px-1', hover === s.label && 'bg-muted/50')}
                  onMouseEnter={() => setHover(s.label)} onMouseLeave={() => setHover(null)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round((s.value / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
