import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/components/ui/dialog'
import { TicketThread } from '@/features/support/components/ticket-thread'
import type { TicketPerson } from '@/features/support/types'

/** Firm Settings → Support keeps its quick pop-up; the thread itself is
 * TicketThread, also used full-page. */
export function TicketThreadDialog({
  ticketId,
  onOpenChange,
  platformView = false,
  assignees = [],
}: {
  ticketId: string | null
  onOpenChange: (open: boolean) => void
  platformView?: boolean
  assignees?: TicketPerson[]
}) {
  return (
    <Dialog open={Boolean(ticketId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="sr-only">Support conversation</DialogTitle>
        <DialogDescription className="sr-only">Messages between your firm and The Counsel</DialogDescription>
        {ticketId && <TicketThread ticketId={ticketId} platformView={platformView} assignees={assignees} />}
      </DialogContent>
    </Dialog>
  )
}
