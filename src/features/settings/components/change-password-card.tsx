import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { KeyRound } from 'lucide-react'
import { PasswordStrength } from '@/features/auth/components/password-strength'
import { useAuth } from '@/features/auth/context/auth-provider'
import { authService } from '@/features/auth/services/auth.service'
import { changePasswordSchema, type ChangePasswordValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'

export function ChangePasswordCard() {
  const { profile, updatePassword } = useAuth()

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', password: '', confirm: '' },
    mode: 'onChange',
  })

  const passwordValue = form.watch('password')

  const onSubmit = async (values: ChangePasswordValues) => {
    if (!profile?.email) return
    try {
      // Supabase has no standalone "verify current password" call — re-authenticating
      // with it is the standard way to confirm it before swapping to the new one.
      await authService.signIn(profile.email, values.currentPassword)
    } catch {
      form.setError('currentPassword', { message: 'Current password is incorrect' })
      return
    }
    try {
      await updatePassword(values.password)
      toast.success('Password changed')
      form.reset({ currentPassword: '', password: '', confirm: '' })
    } catch (err) {
      toast.error('Could not change password', { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Password</CardTitle>
        <p className="text-sm text-muted-foreground">Use a strong password you don't reuse anywhere else.</p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <PasswordStrength value={passwordValue} />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" loading={form.formState.isSubmitting}>
                <KeyRound /> Change password
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
