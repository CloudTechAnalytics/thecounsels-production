import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { useAuth } from '@/features/auth/context/auth-provider'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/features/auth/schemas'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/components/ui/form'
import { TurnstileWidget } from '@/shared/components/turnstile-widget'
import { env } from '@/shared/config/env'
import { logClientError } from '@/shared/lib/error-log'

export function ForgotPasswordPage() {
  const { sendPasswordReset } = useAuth()
  const [sentTo, setSentTo] = React.useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const onSubmit = async (values: ForgotPasswordValues) => {
    // Always resolve to the same UI state to avoid leaking which emails exist —
    // but still surface the real failure to the console so a misconfigured
    // project (rate limit, SMTP, redirect URL) is debuggable instead of silent.
    try {
      await sendPasswordReset(values.email, captchaToken ?? undefined)
    } catch (err) {
      // Deliberately never surfaced to the user (see comment above) — but a
      // real failure here (rate limit, SMTP misconfig) is otherwise
      // completely invisible, so it's worth a record somewhere.
      console.error('Password reset request failed:', err)
      logClientError(err, { source: 'sendPasswordReset' })
    }
    setCaptchaToken(null)
    setSentTo(values.email)
  }

  if (sentTo) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle="If an account exists for that address, a reset link is on its way."
      >
        <div className="rounded-lg border border-border/70 bg-card p-6 text-center shadow-card">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            We sent password reset instructions to
          </p>
          <p className="font-medium">{sentTo}</p>
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
      title="Reset your password"
      subtitle="Enter your work email and we'll send you a secure reset link."
      footer={
        <Link to="/auth/login" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </Link>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
          {env.isTurnstileConfigured && <TurnstileWidget onToken={setCaptchaToken} />}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={form.formState.isSubmitting}
            disabled={env.isTurnstileConfigured && !captchaToken}
          >
            Send reset link
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}
