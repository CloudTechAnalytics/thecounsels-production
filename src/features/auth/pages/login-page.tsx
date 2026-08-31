import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { AuthShell } from '@/features/auth/components/auth-shell'
import { useAuth } from '@/features/auth/context/auth-provider'
import { loginSchema, type LoginValues } from '@/features/auth/schemas'
import { supabase } from '@/shared/lib/supabase'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { TurnstileWidget } from '@/shared/components/turnstile-widget'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form'
import { toast } from '@/shared/components/ui/sonner'
import { env } from '@/shared/config/env'
import { friendlyErrorMessage } from '@/shared/lib/errors'

/**
 * Cosmetic only — resolves a workspace slug (from /w/:slug) to a firm's
 * display name/logo via the narrow public get_organization_by_slug RPC, so
 * the login screen can say "Sign in to {firm}". It plays no role in what
 * the signed-in user can actually access: that's entirely determined by
 * their own memberships once real Supabase Auth completes, same as
 * visiting /auth/login directly. An unknown/mistyped slug just falls back
 * to the generic "Welcome back" — never an error, since guessing at slugs
 * reveals nothing (only a name is ever returned, no data access).
 */
function useWorkspaceBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['workspace-by-slug', slug ?? 'none'],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_organization_by_slug', { p_slug: slug! })
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}

export function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { slug } = useParams<{ slug?: string }>()
  const { data: workspace } = useWorkspaceBySlug(slug)
  const [showPassword, setShowPassword] = React.useState(false)
  const [captchaToken, setCaptchaToken] = React.useState<string | null>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: LoginValues) => {
    try {
      await signIn(values.email, values.password, captchaToken ?? undefined)
      const to = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(to, { replace: true })
    } catch (err) {
      toast.error('Sign in failed', {
        description: friendlyErrorMessage(err, 'Check your credentials and try again.'),
      })
      // Turnstile tokens are single-use — a fresh one is required to retry.
      setCaptchaToken(null)
    }
  }

  return (
    <AuthShell
      title={workspace ? `Sign in to ${workspace.name}` : 'Welcome back'}
      subtitle="Sign in to your firm's workspace to continue."
      back={
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      }
      footer={
        <p>
          Trouble signing in?{' '}
          <Link to="/auth/forgot-password" className="font-medium text-primary hover:underline">
            Reset your password
          </Link>
        </p>
      }
    >
      {!env.isSupabaseConfigured && (
        <div className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
          <p className="font-semibold text-warning">Supabase is not configured yet.</p>
          <p className="mt-1 text-muted-foreground">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
            <code>.env.local</code> to enable authentication.
          </p>
        </div>
      )}

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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    to="/auth/forgot-password"
                    className="text-xs font-medium text-muted-foreground hover:text-primary"
                  >
                    Forgot?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••••"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {env.isTurnstileConfigured && <TurnstileWidget onToken={setCaptchaToken} />}

          {/* Submission is never blocked on captchaToken client-side — the
           * server (Supabase Auth's own captcha_enabled setting) is the
           * real gate. A hard client-side disable here once locked out a
           * real customer on 2026-08-31 when Turnstile silently failed to
           * resolve for them; if enforcement is ever back on server-side
           * and the widget genuinely can't produce a token, the normal
           * sign-in error path below surfaces that instead of a dead
           * button with no explanation. */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={form.formState.isSubmitting}
          >
            Sign in
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Don't have an account?{' '}
        <Link to="/auth/register" className="font-medium text-primary hover:underline">
          Start free
        </Link>
      </p>
    </AuthShell>
  )
}
