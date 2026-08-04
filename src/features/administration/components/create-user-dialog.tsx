import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { useAssignableRoles } from '@/features/administration/hooks/use-administration'
import { adminUsersService } from '@/shared/services/admin-users.service'
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
})
type Values = z.infer<typeof schema>

export function CreateUserDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = React.useState(false)
  const { data: roles } = useAssignableRoles()
  const qc = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '', roleId: '' },
  })

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
      })
      toast.success('User created', { description: `${values.email} can sign in now.` })
      await qc.invalidateQueries({ queryKey: ['administration', 'members', organizationId] })
      form.reset({ fullName: '', email: '', password: '', roleId: values.roleId })
      setOpen(false)
    } catch (err) {
      toast.error('Could not create user', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Create an account for a lawyer or staff member. They'll sign in with this temporary password
            and be required to set their own before they can access the workspace.
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
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create user
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
