import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Mail, MailCheck, ShieldCheck } from 'lucide-react'
import { GetStartedShell } from '@/shared/components/get-started-shell'
import { HintInput } from '@/shared/components/hint-input'
import { OtpInput } from '@/shared/components/otp-input'
import { PasswordChecklist } from '@/features/auth/components/password-checklist'
import { authService } from '@/features/auth/services/auth.service'
import { selfRegisterSchema, type SelfRegisterValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { TurnstileWidget } from '@/shared/components/turnstile-widget'
import { toast } from '@/shared/components/ui/sonner'
import { env } from '@/shared/config/env'
import { errorMessage } from '@/shared/lib/errors'
import { logClientError } from '@/shared/lib/error-log'
import { supabase } from '@/shared/lib/supabase'

// Must match Supabase Auth's mailer_otp_length (Dashboard → Authentication →
// Emails, or the config/auth Management API) — the code in the confirmation
// email is exactly this many digits. Currently 8 on both the testing and
// production projects; if that setting ever changes, update this too.
const OTP_LENGTH = 8
const RESEND_COOLDOWN_SECONDS = 30

/**
 * Public self-service registration — Step 1 (Create Account) of the
 * onboarding flow. No organization exists yet at this point; that only
 * happens once the account is verified and the /onboarding wizard runs to
 * completion (see register_organization() RPC).
 *
 * Verification is an inline email OTP, not a "click the link" email —
 * doubling as one anti-bot layer (a bot can't read and retype a code that
 * only exists in an inbox it doesn't control), and establishing a real
 * signed-in session directly on success, so there's no separate "now go log
 * in" step afterward the way the old link-click flow required. Turnstile
 * (2026-08-31) sits in front of it as a second, earlier layer — stops a
 * scripted signup from even reaching the point of burning a real OTP send,
 * same optional/no-op-until-configured pattern as login-page.tsx.
 */
export function RegisterPage() {
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [showPassword, setShowPassword] = React.useState(false)
  const [otpValue, setOtpValue] = React.useState('')
  const [otpError, setOtpError] = React.useState<string | null>(null)
  const [verifying, setVerifying] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [cooldown, setCooldown] = React.useState(0)
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null)

  const form = useForm<SelfRegisterValues>({
    resolver: zodResolver(selfRegisterSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '', acceptedTerms: false },
  })
  const passwordValue = form.watch('password')

  React.useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

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

      await authService.signUp(
        values.email,
        values.password,
        `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
        captchaToken ?? undefined,
      )
      setSentTo(values.email)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
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

  const verifyCode = React.useCallback(
    async (code: string) => {
      if (!sentTo || code.length !== OTP_LENGTH) return
      setVerifying(true)
      setOtpError(null)
      try {
        await authService.verifySignUpOtp(sentTo, code)
        toast.success('Email verified', { description: "You're in — let's set up your firm." })
        // No manual navigation: verifyOtp() establishes a real session,
        // AuthProvider's onAuthStateChange picks up the resulting SIGNED_IN
        // event and loads it, and RedirectIfAuthenticated (wrapping this
        // route) takes it from there.
      } catch (err) {
        console.error('OTP verification failed:', err)
        logClientError(err, { source: 'verifySignUpOtp' })
        setOtpError(errorMessage(err, 'That code is incorrect or has expired.') ?? 'That code is incorrect or has expired.')
        setOtpValue('')
        setVerifying(false)
      }
    },
    [sentTo],
  )

  const resendCode = async () => {
    if (!sentTo || cooldown > 0) return
    setResending(true)
    try {
      await authService.resendSignUpOtp(sentTo)
      toast.success('New code sent', { description: `Check ${sentTo} for a fresh code.` })
      setOtpValue('')
      setOtpError(null)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      toast.error('Could not resend code', { description: errorMessage(err, 'Please try again shortly.') })
    } finally {
      setResending(false)
    }
  }

  if (sentTo) {
    return (
      <GetStartedShell stepLabel="Verify your email" stepDescription="Enter the code we just sent you." step={1} totalSteps={2}>
        <div className="rounded-lg border border-border/70 bg-card p-6 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">We sent an {OTP_LENGTH}-digit code to</p>
          <p className="font-medium">{sentTo}</p>

          <div className="mt-6">
            <OtpInput
              length={OTP_LENGTH}
              value={otpValue}
              onChange={(v) => {
                setOtpValue(v)
                setOtpError(null)
              }}
              onComplete={verifyCode}
              disabled={verifying}
              autoFocus
            />
          </div>

          {otpError && <p className="mt-3 text-sm text-destructive">{otpError}</p>}

          <Button
            className="mt-6 w-full"
            loading={verifying}
            disabled={otpValue.length !== OTP_LENGTH}
            onClick={() => verifyCode(otpValue)}
          >
            <ShieldCheck className="h-4 w-4" /> Verify
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            Didn't get it?{' '}
            <button
              type="button"
              onClick={resendCode}
              disabled={resending || cooldown > 0}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Wrong email?{' '}
          <button
            type="button"
            onClick={() => {
              setSentTo(null)
              setOtpValue('')
              setOtpError(null)
            }}
            className="font-medium text-primary hover:underline"
          >
            Start over
          </button>
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
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Terms &amp; Conditions
                    </a>{' '}
                    and{' '}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Privacy Policy
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
