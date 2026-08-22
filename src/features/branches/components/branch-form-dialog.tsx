import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateBranch, useUpdateBranch } from '@/features/branches/hooks/use-branches'
import { branchSchema, type BranchFormValues } from '@/features/branches/schemas'
import type { Branch } from '@/features/branches/types'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
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

function toDefaults(branch?: Branch | null): BranchFormValues {
  return {
    name: branch?.name ?? '',
    code: branch?.code ?? '',
    address: branch?.address ?? '',
    city: branch?.city ?? '',
    state: branch?.state ?? '',
    country: branch?.country ?? '',
    phone: branch?.phone ?? '',
    email: branch?.email ?? '',
  }
}

export function BranchFormDialog({
  organizationId,
  branch,
  open,
  onOpenChange,
}: {
  organizationId: string
  branch?: Branch | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const create = useCreateBranch(organizationId)
  const update = useUpdateBranch(organizationId)

  const form = useForm<BranchFormValues>({ resolver: zodResolver(branchSchema), defaultValues: toDefaults(branch) })
  React.useEffect(() => {
    if (open) form.reset(toDefaults(branch))
  }, [open, branch, form])

  const onSubmit = async (values: BranchFormValues) => {
    try {
      if (branch) await update.mutateAsync({ id: branch.id, values })
      else await create.mutateAsync(values)
      toast.success(branch ? 'Branch updated' : 'Branch created')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not save branch', { description: friendlyErrorMessage(err) })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{branch ? 'Edit branch' : 'Add a branch'}</DialogTitle>
          <DialogDescription>A physical office within your firm — Lagos, Abuja, Kano, etc.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Branch name</FormLabel>
                    <FormControl>
                      <Input placeholder="Lagos" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="LAG" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="12 Marina Street" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="Lagos" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input placeholder="Lagos State" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="Nigeria" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+234..." {...field} />
                    </FormControl>
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
                      <Input type="email" placeholder="lagos@firm.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending || update.isPending}>
                {branch ? 'Save changes' : 'Create branch'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
