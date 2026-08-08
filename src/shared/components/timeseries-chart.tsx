import * as React from 'react'
import { cn } from '@/shared/lib/utils'

export interface TimeSeriesPoint {
  /** ISO date, used only as a stable key. */
  date: string
  /** Short display label, e.g. "Aug 5". */
  label: string
  value: number
}

/**
 * Dependency-free single-series time-series chart (line + area), matching
 * bar-chart.tsx / sparkline.tsx's plain-SVG approach. One series only — see
 * the dataviz skill's categorical-palette limit; a multi-metric breakdown
 * belongs in the tooltip (via `renderTooltip`), not as more plotted lines.
 *
 * Ships its own hover layer per the dataviz skill: a crosshair that snaps to
 * the nearest day, a rich HTML tooltip, and per-point keyboard focus parity.
 */
export function TimeSeriesChart<T extends TimeSeriesPoint>({
  data,
  height = 220,
  formatValue = (n) => String(n),
  renderTooltip,
  className,
}: {
  data: T[]
  height?: number
  formatValue?: (n: number) => string
  renderTooltip: (point: T) => React.ReactNode
  className?: string
}) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const gradientId = React.useId().replace(/[:]/g, '')

  const width = 640
  const padX = 8
  const padTop = 16
  const padBottom = 24
  const innerHeight = height - padTop - padBottom

  if (data.length === 0) return null

  const max = Math.max(1, ...data.map((d) => d.value))
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + innerHeight - (d.value / max) * innerHeight,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padTop + innerHeight} L ${points[0].x} ${padTop + innerHeight} Z`

  // Sparse x-axis labels — never one per point, matches marks-and-anatomy's
  // "label selectively" rule and just keeps a dense 90-day range legible.
  const maxLabels = 6
  const labelStride = Math.max(1, Math.ceil(data.length / maxLabels))

  const setFromClientX = (clientX: number) => {
    const svg = svgRef.current
    if (!svg || data.length === 0) return
    const rect = svg.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const svgX = ratio * width
    let nearest = 0
    let nearestDist = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - svgX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = i
      }
    })
    setActiveIndex(nearest)
  }

  const active = activeIndex != null ? points[activeIndex] : null
  const activePoint = activeIndex != null ? data[activeIndex] : null
  const last = points[points.length - 1]
  const lastValue = data[data.length - 1].value

  // Clamp the tooltip's horizontal position so it never overflows the card.
  const tooltipLeftPct = active ? Math.min(88, Math.max(2, (active.x / width) * 100)) : 0

  return (
    <div className={cn('relative', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full touch-none"
        style={{ height }}
        preserveAspectRatio="none"
        onPointerMove={(e) => setFromClientX(e.clientX)}
        onPointerLeave={() => setActiveIndex(null)}
      >
        <defs>
          <linearGradient id={`ts-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.12" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Recessive gridlines: baseline + midline, hairline. */}
        <line x1={padX} x2={width - padX} y1={padTop + innerHeight} y2={padTop + innerHeight} stroke="hsl(var(--border))" strokeWidth="1" />
        <line x1={padX} x2={width - padX} y1={padTop} y2={padTop} stroke="hsl(var(--border))" strokeWidth="1" opacity="0.5" />

        <path d={areaPath} fill={`url(#ts-${gradientId})`} />
        <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Endpoint direct-label per marks-and-anatomy ("lines → value at the end"). */}
        <circle cx={last.x} cy={last.y} r="4" fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth="2" />

        {/* Crosshair + active dot. */}
        {active && (
          <>
            <line x1={active.x} x2={active.x} y1={padTop} y2={padTop + innerHeight} stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.35" />
            <circle cx={active.x} cy={active.y} r="5" fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth="2" />
          </>
        )}

        {/* Per-point focusable hit targets — keyboard parity with hover. */}
        {points.map((p, i) => (
          <circle
            key={data[i].date}
            cx={p.x}
            cy={p.y}
            r="14"
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${data[i].label}: ${formatValue(data[i].value)}`}
            onFocus={() => setActiveIndex(i)}
            onBlur={() => setActiveIndex(null)}
            onPointerDown={() => setActiveIndex(i)}
            className="outline-none focus-visible:fill-primary/10"
          />
        ))}
      </svg>

      {/* X-axis labels. */}
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {data.map((d, i) =>
          i % labelStride === 0 || i === data.length - 1 ? (
            <span key={d.date} className={i === 0 ? '' : i === data.length - 1 ? 'text-right' : 'text-center'}>
              {d.label}
            </span>
          ) : null,
        )}
      </div>

      {/* Endpoint value, shown when not actively hovering elsewhere. */}
      {activeIndex == null && (
        <div className="pointer-events-none absolute right-2 top-2 text-xs font-medium text-muted-foreground">
          {formatValue(lastValue)} today
        </div>
      )}

      {active && activePoint && (
        <div
          className="pointer-events-none absolute z-10 min-w-[9rem] max-w-[16rem] -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-elevated"
          style={{ left: `${tooltipLeftPct}%`, top: 0 }}
        >
          {renderTooltip(activePoint)}
        </div>
      )}
    </div>
  )
}
