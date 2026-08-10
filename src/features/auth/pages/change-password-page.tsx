import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { PasswordStrength } from '@/features/auth/components/password-strength'
import { useAuth } from '@/features/auth/context/auth-provider'
import { resetPasswordSchema, type ResetPasswordValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'
import { errorMessage } from '@/shared/lib/errors'

/**
 * Forced stop-gap between signing in with an admin-set temporary password
 * and reaching the app. Reachable only while authenticated (see router.tsx);
 * RequirePasswordChange sends every other route here while the flag is set,
 * so there is no way around it short of signing out.
 */
export function ChangePasswordPage() {
  const { status, profile, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
    mode: 'onChange',
  })

  const passwordValue = form.watch('password')

  if (status === 'unauthenticated') return <Navigate to="/auth/login" replace />
  // Landed here directly with nothing to change — send them on.
  if (status === 'authenticated' && !profile?.must_change_password) return <Navigate to="/" replace />

  const onSubmit = async (values: ResetPasswordValues) => {
    try {
      await updatePassword(values.password)
      toast.success('Password set', { description: 'Welcome — you\'re all set.' })
      navigate('/', { replace: true })
    } catch (err) {
      toast.error('Could not set password', {
        description: errorMessage(err, 'Please try again.'),
      })
    }
  }

  return (
    <AuthShell
      title="Set your password"
      subtitle="You signed in with a temporary password. Choose a new one to continue."
    >
      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>For your security, this is required before you can access your workspace.</p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" placeholder="••••••••••" {...field} />
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
                  <Input type="password" autoComplete="new-password" placeholder="••••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Set password &amp; continue
          </Button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Sign out instead
          </button>
        </form>
      </Form>
    </AuthShell>
  )
}
