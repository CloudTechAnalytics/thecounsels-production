import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus, X, Users, Check } from 'lucide-react'
import { useAuth } from '@/features/auth/context/auth-provider'
import { useClients } from '@/features/clients/hooks/use-clients'
import { useMatters, useFirmMembers } from '@/features/matters/hooks/use-matters'
import {
  useCreateHearing,
  useUpdateHearing,
  useHearingSupportingLawyers,
  useAddHearingSupportingLawyer,
  useRemoveHearingSupportingLawyer,
} from '@/features/hearings/hooks/use-hearings'
import { hearingsService } from '@/features/hearings/services/hearings.service'
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
import { friendlyErrorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { isMatterClosed } from '@/features/matters/types'
import { BranchPicker } from '@/features/branches/components/branch-picker'
import { memberInBranch, memberLabel } from '@/shared/lib/member-picker'
import type { MemberWithRelations } from '@/features/administration/types'
import { initialsOf } from '@/shared/lib/format'

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
    branchId: hearing?.branch_id ?? '',
    assignedLawyerId: hearing?.assigned_lawyer_id ?? '',
  }
}

/** Live add/remove for hearing_supporting_lawyers (0140) — only meaningful
 * once the hearing actually exists (needs a real hearing_id to insert
 * against), same reasoning MatterTeamCard's own team list only appears on
 * an existing matter, never during creation. */
function SupportingLawyersSection({ hearingId, branchId }: { hearingId: string; branchId: string }) {
  const { activeOrgId, profile } = useAuth()
  const { data: members } = useFirmMembers(activeOrgId)
  const { data: supporting, isLoading } = useHearingSupportingLawyers(hearingId)
  const add = useAddHearingSupportingLawyer(activeOrgId, hearingId, profile?.id ?? null)
  const remove = useRemoveHearingSupportingLawyer(hearingId)
  const [picked, setPicked] = React.useState('')

  const supportingIds = new Set((supporting ?? []).map((s) => s.user_id))
  const available = (members ?? []).filter((m) => memberInBranch(m, branchId) && !supportingIds.has(m.user_id))

  const handleAdd = async () => {
    if (!picked) return
    try {
      await add.mutateAsync(picked)
      setPicked('')
    } catch (err) {
      toast.error('Could not add', { description: friendlyErrorMessage(err) })
    }
  }

  return (
    <div className="space-y-2">
      <FormLabel>Supporting lawyers</FormLabel>
      {isLoading ? null : supporting && supporting.length > 0 ? (
        <ul className="space-y-1.5">
          {supporting.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-semibold text-primary">
                {initialsOf(s.user?.full_name, 'U')}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{s.user?.full_name ?? 'Unknown'}</span>
              <button
                type="button"
                aria-label={`Remove ${s.user?.full_name ?? 'lawyer'}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove.mutate(s.user_id)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No supporting lawyers added.</p>
      )}
      <div className="flex gap-2">
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger className="flex-1"><SelectValue placeholder="Add a supporting lawyer…" /></SelectTrigger>
          <SelectContent>
            {available.map((m) => (
              <SelectItem key={m.id} value={m.user_id}>{memberLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" disabled={!picked || add.isPending} onClick={handleAdd} aria-label="Add">
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

/** Create-mode counterpart to SupportingLawyersSection above — that one
 * mutates hearing_supporting_lawyers immediately against a real hearing_id,
 * which doesn't exist yet for a brand-new hearing. This just tracks picks
 * locally; the form applies them via hearingsService directly once the new
 * hearing's real id comes back from create.mutateAsync (see onSubmit) — same
 * "toggle list, apply the diff on save" pattern matter-form-dialog.tsx uses
 * for its own Assigned Team section. */
function NewSupportingLawyersPicker({
  options,
  value,
  onToggle,
}: {
  options: MemberWithRelations[]
  value: Set<string>
  onToggle: (userId: string) => void
}) {
  return (
    <div className="space-y-2">
      <FormLabel className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" /> Supporting lawyers
      </FormLabel>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No one else in this branch to add yet.</p>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {options.map((m) => {
            const checked = value.has(m.user_id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onToggle(m.user_id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                  checked ? 'bg-primary/10 text-foreground' : 'hover:bg-accent text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {checked && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{memberLabel(m)}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Anyone checked here can also access this hearing (and its matter, if linked).</p>
    </div>
  )
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
  const { data: allMatters } = useMatters(activeOrgId, {})
  const { data: members } = useFirmMembers(activeOrgId)
  // A closed matter is read-only — scheduling/editing a hearing under one
  // would always fail, so it's excluded from fresh selection. Editing an
  // existing hearing whose matter is already closed still shows that
  // matter (though the save itself will still be blocked by RLS either way).
  const matters = React.useMemo(
    () => (allMatters ?? []).filter((m) => !isMatterClosed(m.status) || m.id === hearing?.matter_id),
    [allMatters, hearing?.matter_id],
  )
  const create = useCreateHearing(activeOrgId, profile?.id ?? null)
  const update = useUpdateHearing(activeOrgId)

  const form = useForm<HearingFormValues>({ resolver: zodResolver(hearingSchema), defaultValues: toDefaults(hearing) })
  const matterIdWatch = form.watch('matterId')
  const branchIdWatch = form.watch('branchId') ?? ''
  const assignedLawyerWatch = form.watch('assignedLawyerId') ?? ''
  // A matter-linked hearing inherits that matter's own branch for
  // filtering who's eligible as Assigned/Supporting Lawyer; a standalone
  // hearing uses its own branch field directly.
  const selectedMatter = matters.find((m) => m.id === matterIdWatch)
  const effectiveBranchId = selectedMatter?.branch_id ?? branchIdWatch
  const lawyerOptions = (members ?? []).filter((m) => memberInBranch(m, effectiveBranchId))
  // Already covered via Assigned Lawyer — listing them again in the
  // supporting-lawyers picker too would just be a confusing duplicate.
  const newSupportingOptions = lawyerOptions.filter((m) => m.user_id !== assignedLawyerWatch)
  const [newSupportingIds, setNewSupportingIds] = React.useState<Set<string>>(new Set())
  const toggleNewSupporting = (userId: string) => {
    setNewSupportingIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }
  React.useEffect(() => {
    if (open) {
      form.reset(toDefaults(hearing, presetDate, presetMatterId))
      setNewSupportingIds(new Set())
    }
  }, [open, hearing, presetDate, presetMatterId, form])

  const onSubmit = async (values: HearingFormValues) => {
    const clean = {
      ...values,
      matterId: values.matterId === NONE ? '' : values.matterId,
      assignedLawyerId: values.assignedLawyerId === NONE ? '' : values.assignedLawyerId,
    }
    try {
      if (hearing) {
        await update.mutateAsync({ id: hearing.id, values: clean })
      } else {
        const created = await create.mutateAsync(clean)
        // Supporting lawyers picked before the hearing existed — apply them
        // now against the real id. Best-effort: the hearing itself is
        // already saved at this point, so one failed add here shouldn't
        // read as "the whole save failed" the way describeSaveError's
        // catch below would imply.
        for (const userId of newSupportingIds) {
          await hearingsService.addSupportingLawyer(activeOrgId!, created.id, userId, profile?.id ?? null).catch((e) => {
            console.error('Could not add supporting lawyer:', e)
          })
        }
      }
      toast.success(hearing ? 'Hearing updated' : 'Hearing scheduled')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save hearing', { description: friendlyErrorMessage(err) })
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
                    <FormLabel>Magistrate/Judge</FormLabel>
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

            <FormField
              control={form.control}
              name="assignedLawyerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assigned Lawyer</FormLabel>
                  <Select value={field.value || NONE} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Who's representing at this hearing" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Unassigned</SelectItem>
                      {lawyerOptions.map((m) => (
                        <SelectItem key={m.id} value={m.user_id}>{memberLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            {(!matterIdWatch || matterIdWatch === NONE) && (
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch</FormLabel>
                    <BranchPicker organizationId={activeOrgId} value={field.value ?? ''} onChange={field.onChange} mode="form" restrictToViewer />
                  </FormItem>
                )}
              />
            )}

            <Separator />
            {hearing ? (
              <SupportingLawyersSection hearingId={hearing.id} branchId={effectiveBranchId} />
            ) : (
              <NewSupportingLawyersPicker options={newSupportingOptions} value={newSupportingIds} onToggle={toggleNewSupporting} />
            )}

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
