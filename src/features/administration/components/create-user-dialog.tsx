import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useAssignableRoles } from '@/features/administration/hooks/use-administration'
import { adminUsersService } from '@/shared/services/admin-users.service'
import { BranchPicker } from '@/features/branches/components/branch-picker'
import { BranchMultiToggle } from '@/features/branches/components/branch-multi-toggle'
import { errorMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { toast } from '@/shared/components/ui/sonner'

const schema = z.object({
  fullName: z.string().min(2, 'Enter a full name'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(10, 'At least 10 characters').regex(/[0-9]/, 'Add a number'),
  roleId: z.string().min(1, 'Choose a role'),
  accessScope: z.enum(['organization', 'branch', 'multiple_branches', 'personal']),
  branchId: z.string().optional(),
  branchIds: z.array(z.string()).optional(),
})
type Values = z.infer<typeof schema>

const ACCESS_SCOPE_META: Record<Values['accessScope'], { label: string; description: string }> = {
  organization: { label: 'Organization-wide', description: 'Sees everything across every branch.' },
  branch: { label: 'Single branch', description: 'Sees only their assigned branch.' },
  multiple_branches: { label: 'Multiple branches', description: 'Sees only their assigned branches.' },
  personal: { label: 'Personal only', description: 'Sees only what\'s explicitly assigned to them.' },
}

export function CreateUserDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = React.useState(false)
  const { data: roles } = useAssignableRoles()
  const qc = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '', roleId: '', accessScope: 'organization', branchId: '', branchIds: [] },
  })
  const accessScope = form.watch('accessScope')

  React.useEffect(() => {
    if (roles && !form.getValues('roleId')) {
      const assoc = roles.find((r) => r.key === 'associate') ?? roles[0]
      if (assoc) form.setValue('roleId', assoc.id)
    }
  }, [roles, form])

  const onSubmit = async (values: Values) => {
    const role = roles?.find((r) => r.id === values.roleId)
    if (!role?.key) return
    try {
      await adminUsersService.createUser({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        organizationId,
        roleKey: role.key,
        accessScope: values.accessScope,
        branchIds: values.accessScope === 'branch' ? (values.branchId ? [values.branchId] : []) : values.accessScope === 'multiple_branches' ? values.branchIds ?? [] : [],
      })
      toast.success('Team member added', { description: `${values.email} can sign in with the temporary password now.` })
      // Real reported bug: a newly-invited Partner didn't show up in the
      // matter/hearing forms' lawyer pickers (useFirmMembers, keyed
      // 'firm-members') even though Firm Settings > Members correctly
      // showed them right away — this only ever invalidated the
      // 'administration'/'members' cache, a separate key over the exact
      // same underlying data. useRemoveMember/useSetMembershipStatus
      // already invalidate both together; this is the one member-list
      // mutation that didn't.
      await qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
      await qc.invalidateQueries({ queryKey: ['firm-members', organizationId] })
      form.reset({ fullName: '', email: '', password: '', roleId: values.roleId, accessScope: 'organization', branchId: '', branchIds: [] })
      setOpen(false)
    } catch (err) {
      console.error('Create user failed:', err)
      toast.error('Could not create user', {
        description: errorMessage(err, 'Please try again.'),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            Add a lawyer or staff member to your firm — they'll sign in with this temporary password
            and set their own before they can access the workspace. They only ever join this firm.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jordan Ellis" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="jordan@firm.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="roleId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles?.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Temp password</FormLabel>
                    <FormControl>
                      <Input type="text" placeholder="10+ characters" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormDescription>
              Share this password securely — they'll be asked to change it on first sign-in.
            </FormDescription>

            <FormField
              control={form.control}
              name="accessScope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access scope</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(ACCESS_SCOPE_META).map(([v, meta]) => (
                        <SelectItem key={v} value={v}>
                          {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>{ACCESS_SCOPE_META[field.value].description}</FormDescription>
                </FormItem>
              )}
            />

            {accessScope === 'branch' && (
              <FormField
                control={form.control}
                name="branchId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch</FormLabel>
                    <BranchPicker organizationId={organizationId} value={field.value ?? ''} onChange={field.onChange} mode="form" />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {accessScope === 'multiple_branches' && (
              <FormField
                control={form.control}
                name="branchIds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branches</FormLabel>
                    <BranchMultiToggle organizationId={organizationId} value={field.value ?? []} onChange={field.onChange} />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
