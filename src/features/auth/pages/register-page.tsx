import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { PasswordStrength } from '@/features/auth/components/password-strength'
import { authService } from '@/features/auth/services/auth.service'
import { selfRegisterSchema, type SelfRegisterValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'

/**
 * Public self-service registration — Step 1 (Create Account) of the
 * onboarding flow. No organization exists yet at this point; that only
 * happens once the account is verified and the /onboarding wizard runs to
 * completion (see register_organization() RPC).
 */
export function RegisterPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const form = useForm<SelfRegisterValues>({
    resolver: zodResolver(selfRegisterSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', acceptedTerms: false },
  })
  const passwordValue = form.watch('password')

  const onSubmit = async (values: SelfRegisterValues) => {
    try {
      // needsConfirmation is always true with this project's auth settings
      // (email confirmations are on). If it were ever false, the session
      // would already be live and RequireAuth would route on to /onboarding
      // on its own — showing "check your email" regardless is still correct
      // messaging either way, so there's nothing branch-specific to do here.
      await authService.signUp(
        values.email,
        values.password,
        `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
      )
      setSentTo(values.email)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (/already registered|already exists|already been registered/i.test(message)) {
        toast.error('Account already exists', {
          description: 'An account with this email already exists. Please sign in instead.',
        })
      } else {
        toast.error('Could not create account', { description: message || 'Please try again.' })
      }
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle="You're almost in.">
        <div className="rounded-lg border border-border/70 bg-card p-6 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            You've been sent a verification link at
          </p>
          <p className="font-medium">{sentTo}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Verify your email to continue setting up your firm.
          </p>
        </div>
        <Button asChild variant="ghost" className="mt-6 w-full">
          <Link to="/auth/login">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Start your free access"
      subtitle="Create your account, then set up your firm in a couple of minutes."
      back={
        <Link
          to="/welcome"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      }
      footer={
        <p>
          Already have an account?{' '}
          <Link to="/auth/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input autoComplete="given-name" placeholder="Ada" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input autoComplete="family-name" placeholder="Lovelace" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@firm.com" {...field} />
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
                <FormLabel>Password</FormLabel>
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
            name="confirmPassword"
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

          <FormField
            control={form.control}
            name="acceptedTerms"
            render={({ field }) => (
              <FormItem>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={field.value === true}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span>
                    I agree to the{' '}
                    <a href="#" className="font-medium text-primary hover:underline" onClick={(e) => e.preventDefault()}>
                      Terms &amp; Conditions
                    </a>
                  </span>
                </label>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Create account
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}
