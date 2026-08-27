import * as React from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { Mail, MailWarning, Send } from 'lucide-react'
import { usePermissions } from '@/features/auth/hooks/use-permissions'
import { useClientCommunications, useMatterCommunications } from '@/features/clients/hooks/use-clients'
import type { ClientCommunicationRow } from '@/features/clients/services/clients.service'
import { CommunicationComposerDialog } from '@/features/clients/components/communication-composer-dialog'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge, type BadgeProps } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'

const STATUS_META: Record<ClientCommunicationRow['status'], { label: string; variant: BadgeProps['variant'] }> = {
  SENT: { label: 'Sent', variant: 'success' },
  PENDING: { label: 'Sending…', variant: 'muted' },
  FAILED: { label: 'Failed', variant: 'destructive' },
}

function CommunicationCard({ comm, showMatter }: { comm: ClientCommunicationRow; showMatter: boolean }) {
  const meta = STATUS_META[comm.status]
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
            {comm.status === 'FAILED' ? <MailWarning className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{comm.subject}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              To {comm.recipient_name ? `${comm.recipient_name} · ` : ''}
              {comm.recipient_email}
              {showMatter && comm.matter && (
                <>
                  {' '}
                  · <Link to={`/matters/${comm.matter.id}`} className="text-primary hover:underline">{comm.matter.matter_number ?? comm.matter.title}</Link>
                </>
              )}
            </p>
          </div>
        </div>
        <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{comm.body}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>{comm.sent_by_profile?.full_name ? `Sent by ${comm.sent_by_profile.full_name}` : 'Sent'}</span>
        <span title={format(new Date(comm.created_at), 'PPpp')}>
          {formatDistanceToNow(new Date(comm.created_at), { addSuffix: true })}
        </span>
      </div>
      {comm.status === 'FAILED' && comm.failure_reason && (
        <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{comm.failure_reason}</p>
      )}
    </Card>
  )
}

/**
 * Outbound client-correspondence log. Two entry points share this
 * component: the Client Detail page (every communication across all of a
 * client's matters, plus client-level ones) and a Matter Detail page
 * (strictly this matter's own, matterId locks the composer to it).
 */
export function CommunicationsPanel({
  clientId,
  clientName,
  matterId,
  defaultRecipientEmail,
  defaultRecipientName,
  readOnly = false,
}: {
  clientId: string
  clientName: string
  matterId?: string
  defaultRecipientEmail?: string | null
  defaultRecipientName?: string | null
  readOnly?: boolean
}) {
  const { has } = usePermissions()
  const canSend = has('clients.communicate') && !readOnly
  const clientScoped = useClientCommunications(matterId ? undefined : clientId)
  const matterScoped = useMatterCommunications(matterId)
  const { data, isLoading } = matterId ? matterScoped : clientScoped
  const [composing, setComposing] = React.useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {matterId ? "Emails sent to the client about this matter." : 'Every email sent to this client, across all matters.'}
        </p>
        {canSend && (
          <Button size="sm" onClick={() => setComposing(true)}>
            <Send className="h-3.5 w-3.5" /> New message
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-3">
          {data.map((comm) => (
            <CommunicationCard key={comm.id} comm={comm} showMatter={!matterId} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-muted-foreground">No communications sent yet.</Card>
      )}

      {canSend && (
        <CommunicationComposerDialog
          clientId={clientId}
          clientName={clientName}
          matterId={matterId}
          defaultRecipientEmail={defaultRecipientEmail}
          defaultRecipientName={defaultRecipientName}
          open={composing}
          onOpenChange={setComposing}
        />
      )}
    </div>
  )
}
