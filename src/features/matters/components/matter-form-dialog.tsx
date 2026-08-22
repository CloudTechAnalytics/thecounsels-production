import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useCreateMatter, useUpdateMatter, useFirmMembers } from '@/features/matters/hooks/use-matters'
import { matterSchema, type MatterFormValues } from '@/features/matters/schemas'
import { PRACTICE_AREAS, PRIORITIES, MATTER_STATUSES, MATTER_STATUS_META, type MatterRow } from '@/features/matters/types'
import { BranchPicker } from '@/features/branches/components/branch-picker'
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

/** Supabase's PostgrestError puts the actionable info in `hint`, not
 * `message` — a plain `.message` can read as "row-level security policy
 * violated" with no clue which check failed. Surface both, plus the code. */
function describeSaveError(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return err instanceof Error ? err.message : undefined
  const e = err as { message?: string; hint?: string; code?: string }
  const parts = [e.message?.trim(), e.hint?.trim()].filter((s): s is string => Boolean(s))
  const text = Array.from(new Set(parts)).join(' — ')
  return e.code ? `${text || 'Unknown error'} (${e.code})` : text || undefined
}

function toDefaults(matter?: MatterRow | null): MatterFormValues {
  return {
    title: matter?.title ?? '',
    clientId: matter?.client_id ?? '',
    practiceArea: matter?.practice_area ?? '',
    status: matter?.status ?? 'open',
    priority: (matter?.priority as MatterFormValues['priority']) ?? 'medium',
    leadLawyerId: matter?.lead_lawyer_id ?? '',
    opposingCounsel: matter?.opposing_counsel ?? '',
    court: matter?.court ?? '',
    judge: matter?.judge ?? '',
    description: matter?.description ?? '',
    branchId: matter?.branch_id ?? '',
  }
}

export function MatterFormDialog({
  matter,
  open,
  onOpenChange,
}: {
  matter?: MatterRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { activeOrgId, profile } = useAuth()
  const { data: clients } = useClients(activeOrgId, {})
  const { data: members } = useFirmMembers(activeOrgId)
  const create = useCreateMatter(activeOrgId, profile?.id ?? null)
  const update = useUpdateMatter(activeOrgId)

  const form = useForm<MatterFormValues>({ resolver: zodResolver(matterSchema), defaultValues: toDefaults(matter) })
  React.useEffect(() => {
    if (open) form.reset(toDefaults(matter))
  }, [open, matter, form])

  const onSubmit = async (values: MatterFormValues) => {
    const clean: MatterFormValues = {
      ...values,
      clientId: values.clientId === NONE ? '' : values.clientId,
      practiceArea: values.practiceArea === NONE ? '' : values.practiceArea,
      leadLawyerId: values.leadLawyerId === NONE ? '' : values.leadLawyerId,
    }
    try {
      if (matter) await update.mutateAsync({ id: matter.id, values: clean })
      else await create.mutateAsync(clean)
      toast.success(matter ? 'Matter updated' : 'Matter opened')
      onOpenChange(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Matter save failed:', err)
      toast.error('Could not save matter', { description: describeSaveError(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{matter ? `Edit ${matter.matter_number}` : 'Open a new matter'}</DialogTitle>
          <DialogDescription>A matter is a case or engagement your firm handles for a client.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matter title</FormLabel>
                  <FormControl>
                    <Input placeholder="Acme Corp v. Zenith Holdings" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>No client</SelectItem>
                        {clients?.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="practiceArea"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Practice area</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select area" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {PRACTICE_AREAS.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a}
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
                        {MATTER_STATUSES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {MATTER_STATUS_META[value].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="leadLawyerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Counsel</FormLabel>
                    <Select value={field.value || NONE} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Unassigned</SelectItem>
                        {members?.map((m) => (
                          <SelectItem key={m.id} value={m.user_id}>
                            {m.profile?.full_name ?? m.profile?.email}
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
              name="branchId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch</FormLabel>
                  <BranchPicker organizationId={activeOrgId} value={field.value ?? ''} onChange={field.onChange} mode="form" restrictToViewer />
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="court"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court</FormLabel>
                    <FormControl>
                      <Input placeholder="Federal High Court" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="judge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Magistrate/Judge</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="opposingCounsel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Defendant Counsel</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Summary of the matter…" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {matter ? 'Save changes' : 'Open matter'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
