import { invokeEdgeFunction } from '@/shared/lib/edge-function'

export interface MatterSummaryResult {
  summary: string
  generatedAt: string
}

/** Business/Enterprise only — the real enforcement lives server-side in the
 * summarize-matter Edge Function; see its own comment for why. */
export const matterAiService = {
  summarizeMatter(matterId: string): Promise<MatterSummaryResult> {
    return invokeEdgeFunction('summarize-matter', { matterId })
  },
}
