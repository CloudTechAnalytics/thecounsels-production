import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Hourglass, X } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/ui/button'
import { toast } from '@/shared/components/ui/sonner'
import type { SupportSessionRow } from '@/features/support/types'

const PENDING_ID_KEY = 'counsel.support_pending_id'
const PENDING_ORG_NAME_KEY = 'counsel.support_pending_org_name'

/** Set by SupportSessionDialog right after request_support_session() —
 * read here so this banner (and its realtime listener) can pick up a
 * pending request that was made from a different render/page. */
export function trackPendingSupportRequest(sessionId: string, orgName: string) {
  sessionStorage.setItem(PENDING_ID_KEY, sessionId)
  sessionStorage.setItem(PENDING_ORG_NAME_KEY, orgName)
}

/** Mounted once in the platform console shell. Waits for the firm's own
 * admin to grant or deny a request_support_session() call — see 0133 for
 * why "start" became "request": platform staff no longer enter a
 * workspace unilaterally. On grant, actually enters (same startSupport +
 * navigate the old immediate-entry flow used to do); on deny, says so and
 * stops waiting. */
export function SupportAccessWaitingBanner() {
  const { startSupport } = useAuth()
  const navigate = useNavigate()
  const [pendingId, setPendingId] = React.useState<string | null>(() => sessionStorage.getItem(PENDING_ID_KEY))
  const [orgName, setOrgName] = React.useState<string | null>(() => sessionStorage.getItem(PENDING_ORG_NAME_KEY))

  const clearPending = React.useCallback(() => {
    sessionStorage.removeItem(PENDING_ID_KEY)
    sessionStorage.removeItem(PENDING_ORG_NAME_KEY)
    setPendingId(null)
    setOrgName(null)
  }, [])

  const handleResolved = React.useCallback(
    async (row: SupportSessionRow) => {
      if (row.status === 'active') {
        sessionStorage.setItem('counsel.support_session', row.id)
        sessionStorage.setItem('counsel.support_expires', row.expires_at)
        clearPending()
        toast.success(`Access granted — entering ${orgName ?? "the firm's"} workspace`)
        await startSupport(row.organization_id)
        navigate('/', { replace: true })
      } else if (row.status === 'denied') {
        clearPending()
        toast.error(`Access request denied by ${orgName ?? 'the firm'}`)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgName, clearPending, startSupport, navigate],
  )

  // Poll for the sessionStorage keys changing from elsewhere in the tab
  // (SupportSessionDialog calls trackPendingSupportRequest without a
  // shared state store) — cheap, local, and only runs while nothing is
  // already pending.
  React.useEffect(() => {
    if (pendingId) return
    const t = setInterval(() => {
      const id = sessionStorage.getItem(PENDING_ID_KEY)
      if (id) {
        setPendingId(id)
        setOrgName(sessionStorage.getItem(PENDING_ORG_NAME_KEY))
      }
    }, 500)
    return () => clearInterval(t)
  }, [pendingId])

  React.useEffect(() => {
    if (!pendingId) return

    // Covers the request having already been resolved while this banner
    // wasn't mounted yet (e.g. a page reload) — check once immediately,
    // then rely on the realtime subscription for what happens next.
    supabase
      .from('support_sessions')
      .select('*')
      .eq('id', pendingId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && data.status !== 'pending') void handleResolved(data as unknown as SupportSessionRow)
      })

    const channel = supabase
      .channel(`support-session-wait:${pendingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_sessions', filter: `id=eq.${pendingId}` },
        (payload) => void handleResolved(payload.new as unknown as SupportSessionRow),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId])

  if (!pendingId) return null

  return (
    <div className="flex items-center gap-3 bg-warning px-4 py-2 text-warning-foreground sm:px-6">
      <Hourglass className="h-4 w-4 shrink-0 animate-pulse" />
      <p className="min-w-0 flex-1 truncate text-sm font-medium">
        Waiting for {orgName ?? 'the firm'} to grant support access…
      </p>
      <Button size="sm" variant="secondary" className="shrink-0" onClick={clearPending}>
        <X className="h-4 w-4" /> Stop waiting
      </Button>
    </div>
  )
}
