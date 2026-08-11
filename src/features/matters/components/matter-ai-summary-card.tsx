import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Sparkles, RotateCcw, Lock } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSubscription } from '@/features/administration/hooks/use-administration'
import { useSummarizeMatter } from '@/features/matters/hooks/use-matter-ai'
import type { MatterRow } from '@/features/matters/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'

/** Business/Enterprise only — this only controls what's *shown*; the real
 * enforcement is server-side in the summarize-matter Edge Function, which
 * checks the org's actual plan independently and would reject the request
 * regardless of what this renders. */
function planHasAiSummarization(features: unknown): boolean {
  return Boolean(features && typeof features === 'object' && (features as Record<string, unknown>).ai_summarization === true)
}

export function MatterAiSummaryCard({ matter }: { matter: MatterRow }) {
  const { activeOrgId } = useAuth()
  const { data: subscription } = useSubscription(activeOrgId)
  const summarize = useSummarizeMatter(matter.id)

  const enabled = planHasAiSummarization(subscription?.plan?.features)

  const generate = async () => {
    try {
      await summarize.mutateAsync()
    } catch (err) {
      toast.error('Could not generate summary', { description: err instanceof Error ? err.message : 'Please try again.' })
    }
  }

  if (!enabled) {
    return (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Lock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold">AI Matter Summary</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Get an instant, always-current brief on this matter's status, open tasks and hearings — available on the Business plan and above.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/administration">View plans</Link>
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> AI Matter Summary
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={generate}
          loading={summarize.isPending}
          disabled={summarize.isPending}
        >
          <RotateCcw className="h-3.5 w-3.5" /> {matter.ai_summary ? 'Regenerate' : 'Generate'}
        </Button>
      </CardHeader>
      <CardContent>
        {matter.ai_summary ? (
          <>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{matter.ai_summary}</p>
            {matter.ai_summary_generated_at && (
              <p className="mt-3 text-xs text-muted-foreground">
                Generated {formatDistanceToNow(new Date(matter.ai_summary_generated_at), { addSuffix: true })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {summarize.isPending
              ? 'Reading the matter, tasks and hearings…'
              : 'No summary yet — click Generate for an instant brief on this matter.'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
