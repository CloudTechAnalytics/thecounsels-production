import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePlatformUsers } from '@/features/platform/hooks/use-platform'
import { useTicket } from '@/features/support/hooks/use-support'
import { TicketThread } from '@/features/support/components/ticket-thread'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'

/** Platform Console → one conversation with a firm, full page. */
export function PlatformConversationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: platformUsers = [] } = usePlatformUsers()
  const { data: ticket } = useTicket(id ?? null)
  if (!id) return null
  return (
    <div className="w-full max-w-4xl">
      <div className="mb-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/platform/tickets')}><ArrowLeft className="h-4 w-4" /> Support & messages</Button>
        {ticket?.organization && (
          <Button variant="ghost" size="sm" onClick={() => navigate(`/platform/organizations/${ticket.organization_id}`)}>{ticket.organization.name}</Button>
        )}
      </div>
      <Card className="p-5">
        <TicketThread ticketId={id} platformView assignees={platformUsers} tall />
      </Card>
    </div>
  )
}
