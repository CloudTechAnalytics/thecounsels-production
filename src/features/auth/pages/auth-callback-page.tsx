import { Navigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/context/auth-provider'
import { LoadingScreen } from '@/shared/components/loading-screen'

/**
 * Landing spot for Supabase's email-confirmation redirect (emailRedirectTo
 * in authService.signUp). By the time this renders, onAuthStateChange has
 * already fired and AuthProvider has a confirmed session — this component
 * only needs to route onward, never to do any auth work itself.
 */
export function AuthCallbackPage() {
  const { status, isPlatformAdmin, memberships } = useAuth()

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unauthenticated') return <Navigate to="/auth/login" replace />
  if (isPlatformAdmin) return <Navigate to="/platform" replace />
  // A verified account with no firm yet always continues straight into
  // onboarding; one that somehow already has a membership (e.g. re-clicking
  // an old confirmation link after already finishing setup) goes home.
  return <Navigate to={memberships.length > 0 ? '/' : '/onboarding'} replace />
}
