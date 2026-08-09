import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Send } from 'lucide-react'
import { messageSchema, type MessageFormValues } from '@/features/messaging/schemas'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Form, FormControl, FormField, FormItem } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'

export function MessageComposer({ onSend, disabled }: { onSend: (body: string) => Promise<void>; disabled?: boolean }) {
  const form = useForm<MessageFormValues>({ resolver: zodResolver(messageSchema), defaultValues: { body: '' } })

  const submit = async (values: MessageFormValues) => {
    try {
      await onSend(values.body)
      form.reset({ body: '' })
    } catch (err) {
      toast.error('Could not send message', { description: err instanceof Error ? err.message : undefined })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void form.handleSubmit(submit)()
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex items-end gap-2 border-t border-border p-3">
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Textarea
                  rows={1}
                  placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                  className="max-h-32 min-h-0 resize-none py-2.5"
                  disabled={disabled}
                  onKeyDown={onKeyDown}
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" size="icon" disabled={disabled || form.formState.isSubmitting} aria-label="Send message">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Form>
  )
}
