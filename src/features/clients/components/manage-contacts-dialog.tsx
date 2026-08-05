import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Star, Trash2 } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useAddContact, useClientContacts, useRemoveContact, useSetPrimaryContact } from '@/features/clients/hooks/use-clients'
import { contactSchema, type ContactFormValues } from '@/features/clients/schemas'
import type { Client } from '@/shared/types/database.types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'

const EMPTY: ContactFormValues = { name: '', title: '', email: '', phone: '' }

export function ManageContactsDialog({
  client,
  open,
  onOpenChange,
}: {
  client: Client | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId } = useAuth()
  const clientId = client?.id
  const { data: contacts, isLoading } = useClientContacts(clientId)
  const addContact = useAddContact(activeOrgId, clientId)
  const setPrimary = useSetPrimaryContact(activeOrgId, clientId)
  const removeContact = useRemoveContact(activeOrgId, clientId)

  const form = useForm<ContactFormValues>({ resolver: zodResolver(contactSchema), defaultValues: EMPTY })

  React.useEffect(() => {
    if (open) form.reset(EMPTY)
  }, [open, form])

  const onSubmit = async (values: ContactFormValues) => {
    try {
      await addContact.mutateAsync(values)
      form.reset(EMPTY)
    } catch (err) {
      toast.error('Could not add contact', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contacts</DialogTitle>
          <DialogDescription>Everyone your firm can reach out to at {client?.display_name}.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : contacts && contacts.length > 0 ? (
          <ul className="space-y-2">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {c.name}
                    {c.is_primary && <Badge variant="default" className="text-[10px]">Primary</Badge>}
                    {c.title && <span className="font-normal text-muted-foreground">· {c.title}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!c.is_primary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Make primary"
                      title="Make primary"
                      disabled={setPrimary.isPending}
                      onClick={() => setPrimary.mutate(c.id)}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove contact"
                    disabled={removeContact.isPending}
                    onClick={() => removeContact.mutate(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">No contacts yet.</p>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 border-t border-border pt-4" noValidate>
            <p className="text-sm font-medium">Add a contact</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input placeholder="Jane Doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl><Input placeholder="General Counsel" {...field} /></FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="jane@acme.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input placeholder="+234…" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={addContact.isPending}>
                <Plus className="h-4 w-4" /> Add contact
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
