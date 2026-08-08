import * as React from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import {
  Flag,
  ArrowRightLeft,
  StickyNote,
  FileUp,
  FileX,
  PencilLine,
  Gavel,
  CalendarClock,
  CalendarX,
  CalendarOff,
  ListChecks,
  CheckCheck,
  Receipt,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useMatterEvents, useAddMatterEvent } from '@/features/matters/hooks/use-matter-events'
import { StatusTracker } from '@/features/matters/components/status-tracker'
import type { MatterRow } from '@/features/matters/types'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { toast } from '@/shared/components/ui/sonner'

const EVENT_ICON: Record<string, LucideIcon> = {
  created: Flag,
  status_changed: ArrowRightLeft,
  note_added: StickyNote,
  document_added: FileUp,
  document_removed: FileX,
  document_renamed: PencilLine,
  hearing_scheduled: Gavel,
  hearing_updated: PencilLine,
  hearing_rescheduled: CalendarClock,
  hearing_cancelled: CalendarX,
  hearing_deleted: CalendarOff,
  task_added: ListChecks,
  task_completed: CheckCheck,
  invoice_created: Receipt,
  update: PencilLine,
}

export function MatterTimeline({ matter }: { matter: MatterRow }) {
  const { activeOrgId, profile } = useAuth()
  const { data: events, isLoading } = useMatterEvents(matter.id)
  const add = useAddMatterEvent(activeOrgId, matter.id, profile?.id ?? null)
  const [body, setBody] = React.useState('')

  const submit = async () => {
    if (!body.trim()) return
    try {
      await add.mutateAsync(body.trim())
      setBody('')
    } catch (err) {
      toast.error('Could not log update', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="space-y-3 p-4">
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Log an update — e.g. “Filed motion to dismiss”, “Client called about settlement”…"
          />
          <div className="flex justify-end">
            <Button onClick={submit} loading={add.isPending} disabled={!body.trim()}>
              Log update
            </Button>
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : events && events.length > 0 ? (
          <ol className="relative ml-3 space-y-5 border-l border-border pl-6">
            {events.map((e) => {
              const Icon = EVENT_ICON[e.kind] ?? PencilLine
              return (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-primary/12 text-primary ring-4 ring-background">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm">{e.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.actor?.full_name ? `${e.actor.full_name} · ` : ''}
                    <span title={format(new Date(e.created_at), 'PPpp')}>
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </span>
                  </p>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity tracked yet.</p>
        )}
      </div>

      <div>
        <Card className="p-6">
          <p className="mb-4 text-sm font-semibold">Status tracker</p>
          <StatusTracker status={matter.status} />
          <div className="mt-6 space-y-1 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opened</span>
              <span className="font-medium">{format(new Date(matter.opened_on), 'PP')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tracked events</span>
              <span className="font-medium">{events?.length ?? 0}</span>
            </div>
            {matter.closed_on && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Closed</span>
                <span className="font-medium">{format(new Date(matter.closed_on), 'PP')}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
