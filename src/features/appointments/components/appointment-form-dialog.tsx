import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useMatters, useFirmMembers } from '@/features/matters/hooks/use-matters'
import { useCreateAppointment, useUpdateAppointment } from '@/features/appointments/hooks/use-appointments'
import { appointmentSchema, type AppointmentFormValues } from '@/features/appointments/schemas'
import { APPOINTMENT_STATUS_META, type AppointmentRow } from '@/features/appointments/types'
import { isMatterClosed } from '@/features/matters/types'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'
import { friendlyErrorMessage } from '@/shared/lib/errors'

const NONE = '__none__'

/** yyyy-MM-ddThh:mm in local time for <input type="datetime-local">. */
function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

function toDefaults(appointment?: AppointmentRow | null, presetDate?: string, presetClientId?: string): AppointmentFormValues {
  return {
    clientId: appointment?.client_id ?? presetClientId ?? '',
    matterId: appointment?.matter_id ?? '',
    title: appointment?.title ?? '',
    appointmentAt: toLocalInput(appointment?.appointment_at ?? presetDate),
    durationMinutes: appointment?.duration_minutes ?? undefined,
    location: appointment?.location ?? '',
    assignedToId: appointment?.assigned_to_id ?? '',
    status: appointment?.status ?? 'scheduled',
    notes: appointment?.notes ?? '',
  }
}

export function AppointmentFormDialog({
  appointment,
  presetDate,
  presetClientId,
  open,
  onOpenChange,
}: {
  appointment?: AppointmentRow | null
  presetDate?: string
  presetClientId?: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const { data: clients } = useClients(activeOrgId, {})
  const { data: allMatters } = useMatters(activeOrgId, {})
  const { data: members } = useFirmMembers(activeOrgId)
  // Same convention as the hearing form — a closed matter is excluded from
  // fresh selection, but stays visible while editing an appointment
  // already linked to one (the save itself is still RLS-blocked either way).
  const matters = React.useMemo(
    () => (allMatters ?? []).filter((m) => !isMatterClosed(m.status) || m.id === appointment?.matter_id),
    [allMatters, appointment?.matter_id],
  )
  const create = useCreateAppointment(activeOrgId, profile?.id ?? null)
  const update = useUpdateAppointment(activeOrgId)

  const form = useForm<AppointmentFormValues>({ resolver: zodResolver(appointmentSchema), defaultValues: toDefaults(appointment) })
  React.useEffect(() => {
    if (open) form.reset(toDefaults(appointment, presetDate, presetClientId))
  }, [open, appointment, presetDate, presetClientId, form])

  const onSubmit = async (values: AppointmentFormValues) => {
    const clean = {
      ...values,
      clientId: values.clientId === NONE ? '' : values.clientId,
      matterId: values.matterId === NONE ? '' : values.matterId,
      assignedToId: values.assignedToId === NONE ? '' : values.assignedToId,
    }
    try {
      if (appointment) await update.mutateAsync({ id: appointment.id, values: clean })
      else await create.mutateAsync(clean)
      toast.success(appointment ? 'Appointment updated' : 'Appointment scheduled')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save appointment', { description: friendlyErrorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? 'Edit appointment' : 'Schedule an appointment'}</DialogTitle>
          <DialogDescription>Client meetings, consultations and other non-court appointments.</DialogDescription>
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
                    <Input placeholder="Initial consultation — Jane Doe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="appointmentAt"
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
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No client</SelectItem>
                        {clients?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>
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
                name="assignedToId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned to</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {members?.map((m) => (
                          <SelectItem key={m.id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="matterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matter (optional)</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No matter" />
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
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} placeholder="30" {...field} value={field.value ?? ''} />
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
                      <Input placeholder="Meeting room 1, or a link" {...field} />
                    </FormControl>
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
                        {Object.entries(APPOINTMENT_STATUS_META).map(([v, meta]) => (
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

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {appointment ? 'Save changes' : 'Schedule appointment'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
