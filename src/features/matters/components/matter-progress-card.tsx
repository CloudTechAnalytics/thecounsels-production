import { format } from 'date-fns'
import { StatusTracker } from '@/features/matters/components/status-tracker'
import { useMatterEvents } from '@/features/matters/hooks/use-matter-events'
import type { MatterRow } from '@/features/matters/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'

export function MatterProgressCard({ matter }: { matter: MatterRow }) {
  const { data: events } = useMatterEvents(matter.id)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Progress</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
