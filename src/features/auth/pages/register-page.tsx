import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Mail, MailCheck } from 'lucide-react'
import { GetStartedShell } from '@/shared/components/get-started-shell'
import { HintInput } from '@/shared/components/hint-input'
import { TurnstileWidget } from '@/shared/components/turnstile-widget'
import { PasswordChecklist } from '@/features/auth/components/password-checklist'
import { authService } from '@/features/auth/services/auth.service'
import { selfRegisterSchema, type SelfRegisterValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'
import { env } from '@/shared/config/env'
import { errorMessage } from '@/shared/lib/errors'
import { supabase } from '@/shared/lib/supabase'

/**
 * Public self-service registration — Step 1 (Create Account) of the
 * onboarding flow. No organization exists yet at this point; that only
 * happens once the account is verified and the /onboarding wizard runs to
 * completion (see register_organization() RPC).
 */
export function RegisterPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null)

  const form = useForm<SelfRegisterValues>({
    resolver: zodResolver(selfRegisterSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', acceptedTerms: false },
  })
  const passwordValue = form.watch('password')

  const onSubmit = async (values: SelfRegisterValues) => {
    try {
      // Supabase's own signUp() deliberately doesn't reveal whether an
      // already-confirmed email is already registered (anti-enumeration
      // behavior) — it can silently no-op instead of erroring, leaving
      // someone stuck waiting for a verification email that was never
      // actually sent. Check our own side first so this is instant and
      // unambiguous instead of a confusing indefinite wait.
      const { data: alreadyRegistered } = await supabase.rpc('email_is_registered', { p_email: values.email })
      if (alreadyRegistered) {
        toast.error('Account already exists', {
          description: 'An account with this email already exists. Please sign in instead.',
        })
        return
      }

      // needsConfirmation is always true with this project's auth settings
      // (email confirmations are on). If it were ever false, the session
      // would already be live and RequireAuth would route on to /onboarding
      // on its own — showing "check your email" regardless is still correct
      // messaging either way, so there's nothing branch-specific to do here.
      await authService.signUp(
        values.email,
        values.password,
        `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
        captchaToken ?? undefined,
      )
      setSentTo(values.email)
    } catch (err) {
      // Logged unconditionally so a failure anyone else hits (not just
      // reproducible locally) is diagnosable from their own browser console
      // instead of guessing blind — errorMessage() below already handles
      // the common shapes, but this is the fallback when it can't.
      console.error('Sign-up failed:', err)
      const message = errorMessage(err, '') ?? ''
      if (/already registered|already exists|already been registered/i.test(message)) {
        toast.error('Account already exists', {
          description: 'An account with this email already exists. Please sign in instead.',
        })
      } else {
        toast.error('Could not create account', { description: message || 'Please try again.' })
      }
      // Turnstile tokens are single-use — a fresh one is required to retry.
      setCaptchaToken(null)
    }
  }

  if (sentTo) {
    return (
      <GetStartedShell stepLabel="Check your email" stepDescription="You're almost in.">
        <div className="rounded-lg border border-border/70 bg-card p-6 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">You've been sent a verification link at</p>
          <p className="font-medium">{sentTo}</p>
          <p className="mt-3 text-sm text-muted-foreground">Verify your email to continue setting up your firm.</p>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Wrong email?{' '}
          <Link to="/auth/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </GetStartedShell>
    )
  }

  return (
    <GetStartedShell stepLabel="Administrator Details" stepDescription="Let's get your account set up" step={0} totalSteps={2}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name<span className="text-destructive"> *</span></FormLabel>
                  <FormControl>
                    <HintInput hint="A-Z" autoComplete="given-name" placeholder="First name" autoFocus {...field} />
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
                  <FormLabel>Last name<span className="text-destructive"> *</span></FormLabel>
                  <FormControl>
                    <HintInput hint="A-Z" autoComplete="family-name" placeholder="Last name" {...field} />
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
                <FormLabel>Work email<span className="text-destructive"> *</span></FormLabel>
                <FormControl>
                  <HintInput hintIcon={Mail} type="email" autoComplete="email" placeholder="you@firm.com" {...field} />
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
                <FormLabel>Password<span className="text-destructive"> *</span></FormLabel>
                <FormControl>
                  <HintInput
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Min. 10 characters"
                    {...field}
                  />
                </FormControl>
                <PasswordChecklist value={passwordValue} />
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password<span className="text-destructive"> *</span></FormLabel>
                <FormControl>
                  <HintInput type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Retype password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Show password
          </label>

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

          {env.isTurnstileConfigured && <TurnstileWidget onToken={setCaptchaToken} />}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={form.formState.isSubmitting}
            disabled={env.isTurnstileConfigured && !captchaToken}
          >
            Sign Up
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/auth/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </GetStartedShell>
  )
}
