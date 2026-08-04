import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useMatters } from '@/features/matters/hooks/use-matters'
import { useCreateHearing, useUpdateHearing } from '@/features/hearings/hooks/use-hearings'
import { hearingSchema, type HearingFormValues } from '@/features/hearings/schemas'
import { HEARING_TYPES, HEARING_STATUS_META, type HearingRow } from '@/features/hearings/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Separator } from '@/shared/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'

const NONE = '__none__'

/** yyyy-MM-ddThh:mm in local time for <input type="datetime-local">. */
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

function toDefaults(hearing?: HearingRow | null, presetDate?: string, presetMatterId?: string): HearingFormValues {
  return {
    matterId: hearing?.matter_id ?? presetMatterId ?? '',
    title: hearing?.title ?? '',
    hearingAt: toLocalInput(hearing?.hearing_at ?? presetDate),
    type: hearing?.type ?? 'hearing',
    status: hearing?.status ?? 'scheduled',
    court: hearing?.court ?? '',
    judge: hearing?.judge ?? '',
    location: hearing?.location ?? '',
    notes: hearing?.notes ?? '',
    outcome: hearing?.outcome ?? '',
  }
}

export function HearingFormDialog({
  hearing,
  presetDate,
  presetMatterId,
  open,
  onOpenChange,
}: {
  hearing?: HearingRow | null
  presetDate?: string
  presetMatterId?: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  useClients(activeOrgId, {}) // warm cache
  const { data: matters } = useMatters(activeOrgId, {})
  const create = useCreateHearing(activeOrgId, profile?.id ?? null)
  const update = useUpdateHearing(activeOrgId)

  const form = useForm<HearingFormValues>({ resolver: zodResolver(hearingSchema), defaultValues: toDefaults(hearing) })
  React.useEffect(() => {
    if (open) form.reset(toDefaults(hearing, presetDate, presetMatterId))
  }, [open, hearing, presetDate, presetMatterId, form])

  const onSubmit = async (values: HearingFormValues) => {
    const clean = { ...values, matterId: values.matterId === NONE ? '' : values.matterId }
    try {
      if (hearing) await update.mutateAsync({ id: hearing.id, values: clean })
      else await create.mutateAsync(clean)
      toast.success(hearing ? 'Hearing updated' : 'Hearing scheduled')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save hearing', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{hearing ? 'Edit hearing' : 'Schedule a hearing'}</DialogTitle>
          <DialogDescription>Court dates, mentions, rulings and other appearances.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Motion hearing — Acme v. Zenith" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="hearingAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date &amp; time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="matterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Link a matter" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No matter</SelectItem>
                        {matters?.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.matter_number} — {m.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {HEARING_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(HEARING_STATUS_META).map(([v, meta]) => (
                          <SelectItem key={v} value={v}>
                            {meta.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="court"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="judge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Judge</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Courtroom 4" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Separator />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="outcome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Outcome</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Record what happened (once held)…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {hearing ? 'Save changes' : 'Schedule hearing'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
