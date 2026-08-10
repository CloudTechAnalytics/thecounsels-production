import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/context/auth-provider'
import { LoadingScreen } from '@/shared/components/loading-screen'

/**
 * Landing spot for Supabase's email-confirmation redirect (emailRedirectTo
 * in authService.signUp) when the Redirect URL allow-list is configured
 * correctly for the current domain. The actual "sign this confirmation
 * session out and send them to a normal sign-in" logic lives centrally in
 * AuthProvider (see hadAuthRedirectInUrl) instead of here — that catches
 * the same SIGNED_IN event regardless of which page the link lands the
 * browser on, so it isn't broken by a stale/missing Redirect URL entry.
 * This page is deliberately passive: a plain loading state while that
 * resolves, with a plain fallback to login if it somehow doesn't.
 */
export function AuthCallbackPage() {
  const { status } = useAuth()
  if (status === 'unauthenticated') return <Navigate to="/auth/login" replace />
  return <LoadingScreen label="Verifying your email…" />
}
