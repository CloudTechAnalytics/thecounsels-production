import { FileText, Gavel, CheckSquare, StickyNote, Receipt, type LucideIcon } from 'lucide-react'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useMatterSummary } from '@/features/matters/hooks/use-matter-summary'
import type { MatterRow } from '@/features/matters/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { formatMoneyCompact } from '@/shared/lib/format'

type Tab = 'timeline' | 'hearings' | 'tasks' | 'documents' | 'notes'

function SummaryRow({
  icon: Icon,
  label,
  value,
  hint,
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: string
  hint?: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 disabled:cursor-default"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </Comp>
  )
}

export function MatterSummaryCard({ matter, onNavigateTab }: { matter: MatterRow; onNavigateTab: (tab: Tab) => void }) {
  const { has } = usePermissions()
  const { data, isLoading } = useMatterSummary(matter.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Matter Summary</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : (
          <div className="divide-y divide-border">
            <SummaryRow icon={FileText} label="Documents" value={String(data?.documents ?? 0)} onClick={() => onNavigateTab('documents')} />
            <SummaryRow
              icon={Gavel}
              label="Hearings"
              value={String(data?.hearings ?? 0)}
              hint={data?.upcomingHearings ? `${data.upcomingHearings} upcoming` : undefined}
              onClick={() => onNavigateTab('hearings')}
            />
            <SummaryRow
              icon={CheckSquare}
              label="Tasks"
              value={String(data?.tasks ?? 0)}
              hint={data?.openTasks ? `${data.openTasks} open` : undefined}
              onClick={() => onNavigateTab('tasks')}
            />
            <SummaryRow icon={StickyNote} label="Notes" value={String(data?.notes ?? 0)} onClick={() => onNavigateTab('notes')} />
            {has('billing.view') && (
              <SummaryRow
                icon={Receipt}
                label="Invoiced"
                value={formatMoneyCompact(data?.invoicesTotal ?? 0)}
                hint={data?.invoicesOutstanding ? `${formatMoneyCompact(data.invoicesOutstanding)} outstanding` : undefined}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
