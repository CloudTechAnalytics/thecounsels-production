import { Bell, Briefcase, CheckSquare, Gavel, Home, Menu } from 'lucide-react'
import { CounselMark } from '@/shared/components/counsel-mark'
import { cn } from '@/shared/lib/utils'

/**
 * Hand-built mock of The Counsel's phone app (the installable PWA's home
 * screen, bottom tab bar and all), drawn in the app's own tokens so it
 * follows light/dark like the real thing. Illustrative content only.
 */
export function PhoneMock({ className }: { className?: string }) {
  return (
    <div className={cn('relative w-[280px] rounded-[46px] bg-[hsl(216_14%_11%)] p-[11px] shadow-[0_50px_90px_-40px_rgba(20,16,10,0.55)] sm:w-[300px]', className)}>
      <div className="relative flex aspect-[9/19.2] flex-col overflow-hidden rounded-[36px] bg-background text-foreground">
        {/* status bar + island */}
        <div className="relative flex h-9 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="absolute left-1/2 top-2 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[hsl(216_14%_11%)]" />
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-[2px] border border-current" />
          </span>
        </div>

        {/* top bar */}
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <CounselMark className="h-6 w-6" />
            <span className="text-[12px] font-semibold">Okafor &amp; Partners</span>
          </div>
          <Bell className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex-1 space-y-2.5 overflow-hidden px-4">
          <div>
            <p className="text-[10px] text-muted-foreground">Good morning</p>
            <p className="font-display text-[17px] font-semibold leading-tight">Today at the firm</p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[
              ['24', 'Active matters'],
              ['3', 'Hearings this week'],
              ['7', 'Open tasks'],
            ].map(([n, l]) => (
              <div key={l} className="rounded-xl border border-border bg-card px-2 py-2">
                <p className="font-display text-[16px] font-semibold lining-nums text-primary">{n}</p>
                <p className="text-[8.5px] leading-tight text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-2.5">
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground">Next hearing</p>
            <div className="mt-1.5 flex gap-2 border-l-2 border-primary pl-2">
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold">Cargo Loss Dispute</p>
                <p className="text-[9.5px] text-muted-foreground">Federal High Court · Court 4</p>
                <p className="mt-0.5 text-[9.5px] font-semibold text-primary">Tomorrow, 9:00 AM</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-2.5">
            <p className="text-[8.5px] font-semibold uppercase tracking-wider text-muted-foreground">Your tasks</p>
            {[
              ['Draft witness statement', true],
              ['File motion on notice', false],
              ['Call client re: settlement', false],
            ].map(([t, done]) => (
              <div key={t as string} className="mt-1.5 flex items-center gap-2">
                <span className={cn('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', done ? 'border-primary bg-primary' : 'border-border')}>
                  {done && <span className="h-1.5 w-1 rotate-45 border-b border-r border-primary-foreground" />}
                </span>
                <span className={cn('truncate text-[10.5px]', done && 'text-muted-foreground line-through')}>{t as string}</span>
              </div>
            ))}
          </div>
        </div>

        {/* tab bar */}
        <div className="grid shrink-0 grid-cols-5 border-t border-border/70 bg-background pb-3 pt-1.5">
          {[
            [Home, 'Home', true],
            [Briefcase, 'Matters', false],
            [Gavel, 'Hearings', false],
            [CheckSquare, 'Tasks', false],
            [Menu, 'More', false],
          ].map(([Icon, label, on]) => {
            const I = Icon as typeof Home
            return (
              <div key={label as string} className={cn('flex flex-col items-center gap-0.5 text-[8.5px] font-medium', on ? 'text-primary' : 'text-muted-foreground')}>
                <span className={cn('flex h-5 w-8 items-center justify-center rounded-full', on && 'bg-primary/12')}>
                  <I className="h-3.5 w-3.5" />
                </span>
                {label as string}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
