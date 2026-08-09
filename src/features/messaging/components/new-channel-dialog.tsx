import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useCreateChannel } from '@/features/messaging/hooks/use-messaging'
import { channelSchema, type ChannelFormValues } from '@/features/messaging/schemas'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'

export function NewChannelDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (channelId: string) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const create = useCreateChannel(activeOrgId, profile?.id ?? null)
  const form = useForm<ChannelFormValues>({ resolver: zodResolver(channelSchema), defaultValues: { name: '', description: '' } })

  const onSubmit = async (values: ChannelFormValues) => {
    try {
      const channel = await create.mutateAsync(values)
      toast.success(`#${channel.name} created`)
      form.reset({ name: '', description: '' })
      onOpenChange(false)
      onCreated(channel.id)
    } catch (err) {
      toast.error('Could not create channel', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New channel</DialogTitle>
          <DialogDescription>Visible to everyone in your firm — not just people you add.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel name</FormLabel>
                  <FormControl><Input placeholder="general" autoFocus {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl><Textarea rows={2} placeholder="What's this channel for?" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" loading={create.isPending}>Create channel</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
