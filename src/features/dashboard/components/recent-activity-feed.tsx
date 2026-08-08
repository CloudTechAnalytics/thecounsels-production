import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Radio } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useRecentActivity } from '@/features/dashboard/hooks/use-recent-activity'
import { initialsOf } from '@/shared/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'

/** Firm-wide chronological activity feed — who did what, when, click through to it. */
export function RecentActivityFeed() {
  const { activeOrgId } = useAuth()
  const { data, isLoading } = useRecentActivity(activeOrgId)

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">What's happening across your firm, as it happens</p>
        </div>
        <Radio className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-border/70">
            {data.map((item) => (
              <li key={item.id}>
                <Link to={item.href} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80">
                  <Avatar className="h-8 w-8 shrink-0">
                    {item.actorAvatarUrl && <AvatarImage src={item.actorAvatarUrl} alt="" />}
                    <AvatarFallback>{initialsOf(item.actorName)}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{item.actorName}</span>{' '}
                    <span className="text-muted-foreground">{item.summary.charAt(0).toLowerCase()}{item.summary.slice(1)}</span>
                  </p>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No activity has been recorded yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
