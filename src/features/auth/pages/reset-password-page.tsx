import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { PasswordStrength } from '@/features/auth/components/password-strength'
import { useAuth } from '@/features/auth/context/auth-provider'
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { PasswordInput } from '@/shared/components/ui/password-input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

export function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
    mode: 'onChange',
  })

  const passwordValue = form.watch('password')

  const onSubmit = async (values: ResetPasswordValues) => {
    try {
      await updatePassword(values.password)
      toast.success('Password updated', { description: 'You can now use your new password.' })
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Could not update password', {
        description: errorMessage(err, 'Your reset link may have expired. Request a new one.'),
      })
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you don't use anywhere else."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="••••••••••" {...field} />
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
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="new-password" placeholder="••••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Update password
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}
