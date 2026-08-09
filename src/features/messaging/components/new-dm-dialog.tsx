import * as React from 'react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useFirmMembers } from '@/features/matters/hooks/use-matters'
import { useGetOrCreateConversation } from '@/features/messaging/hooks/use-messaging'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'

export function NewDmDialog({
  open,
  onOpenChange,
  onSelected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelected: (conversationId: string) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const { data: members } = useFirmMembers(activeOrgId)
  const getOrCreate = useGetOrCreateConversation(activeOrgId)
  const [picked, setPicked] = React.useState('')

  const others = (members ?? []).filter((m) => m.user_id !== profile?.id && m.status === 'active')

  React.useEffect(() => {
    if (!open) setPicked('')
  }, [open])

  const start = async () => {
    if (!picked) return
    try {
      const convo = await getOrCreate.mutateAsync(picked)
      onOpenChange(false)
      onSelected(convo.id)
    } catch (err) {
      toast.error('Could not start conversation', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>Start a direct conversation with anyone in your firm.</DialogDescription>
        </DialogHeader>
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger><SelectValue placeholder="Choose a colleague…" /></SelectTrigger>
          <SelectContent>
            {others.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!picked} loading={getOrCreate.isPending} onClick={start}>Start conversation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
