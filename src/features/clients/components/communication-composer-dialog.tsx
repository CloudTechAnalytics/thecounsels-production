import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useSendCommunication, useResendCommunication } from '@/features/clients/hooks/use-clients'
import { communicationSchema, type CommunicationFormValues } from '@/features/clients/schemas'
import type { ClientCommunicationRow } from '@/features/clients/services/clients.service'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'
import { friendlyErrorMessage } from '@/shared/lib/errors'

/**
 * Sends a real email to the client (Resend, via send-client-communication)
 * and logs it as a permanent client_communications row — this is an
 * outward-facing, hard-to-reverse action (an actual email leaves the
 * building), so unlike most create dialogs in this app there's no silent
 * auto-send: the recipient/subject/body are always shown back before
 * submit, and a failure is surfaced plainly rather than swallowed.
 *
 * Doubles as the "edit & resend" dialog for a row that never actually
 * sent (PENDING/FAILED — pass it as `editing`) — a SENT row is never
 * passed in here; RLS would refuse the update anyway (migration 0149).
 */
export function CommunicationComposerDialog({
  clientId,
  clientName,
  matterId,
  defaultRecipientEmail,
  defaultRecipientName,
  editing,
  open,
  onOpenChange,
}: {
  clientId: string
  clientName: string
  /** Fixed when composing from a Matter's own Communications tab; the
   * client-level composer leaves this to the message (client-wide, no
   * matter tie) since there's no single matter to default to. */
  matterId?: string
  defaultRecipientEmail?: string | null
  defaultRecipientName?: string | null
  editing?: ClientCommunicationRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const send = useSendCommunication(activeOrgId, clientId, matterId)
  const resend = useResendCommunication(clientId, matterId)
  const pending = editing ? resend.isPending : send.isPending

  const form = useForm<CommunicationFormValues>({
    resolver: zodResolver(communicationSchema),
    values: {
      matterId: matterId ?? '',
      recipientName: editing?.recipient_name ?? defaultRecipientName ?? '',
      recipientEmail: editing?.recipient_email ?? defaultRecipientEmail ?? '',
      subject: editing?.subject ?? '',
      body: editing?.body ?? '',
    },
  })

  const onSubmit = async (values: CommunicationFormValues) => {
    try {
      const result = editing
        ? await resend.mutateAsync({
            id: editing.id,
            recipientName: values.recipientName || null,
            recipientEmail: values.recipientEmail,
            subject: values.subject,
            body: values.body,
          })
        : await send.mutateAsync({
            matterId: matterId ?? null,
            sentBy: profile?.id ?? null,
            recipientName: values.recipientName || null,
            recipientEmail: values.recipientEmail,
            subject: values.subject,
            body: values.body,
          })
      if (result.status === 'FAILED') {
        toast.error('Email could not be sent', { description: result.failure_reason ?? undefined })
        return
      }
      toast.success(`Email sent to ${values.recipientName || values.recipientEmail}`)
      form.reset({ matterId: matterId ?? '', recipientName: '', recipientEmail: '', subject: '', body: '' })
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not send email', { description: friendlyErrorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit & resend' : 'New client communication'}</DialogTitle>
          <DialogDescription>Sends a real email to {clientName} and logs it below.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="recipientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient name</FormLabel>
                    <FormControl>
                      <Input placeholder={clientName} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="recipientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipient email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="client@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="subject"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subject</FormLabel>
                  <FormControl>
                    <Input placeholder="Confirmation of payment received" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="body"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message</FormLabel>
                  <FormControl>
                    <Textarea rows={8} placeholder={`Dear ${clientName},\n\n`} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {editing ? 'Resend email' : 'Send email'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
