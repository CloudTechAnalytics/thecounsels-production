import * as React from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/context/auth-provider'
import { LoadingScreen } from '@/shared/components/loading-screen'
import { toast } from '@/shared/components/ui/sonner'

/**
 * Landing spot for Supabase's email-confirmation redirect (emailRedirectTo
 * in authService.signUp). Confirming the link also establishes a session
 * (PKCE) — but this deliberately doesn't ride that session into the app.
 * Same "confirm your own credentials before entering" rule as everywhere
 * else in this flow now (registration, checkout): sign the confirmation
 * session out and send them to a normal sign-in instead of auto-continuing
 * into onboarding/the dashboard.
 */
export function AuthCallbackPage() {
  const { status, signOut } = useAuth()
  const navigate = useNavigate()
  const handledRef = React.useRef(false)

  React.useEffect(() => {
    if (status !== 'authenticated' || handledRef.current) return
    handledRef.current = true
    void (async () => {
      await signOut()
      toast.success('Email verified', { description: 'Sign in to continue setting up your firm.' })
      navigate('/auth/login', { replace: true })
    })()
  }, [status, signOut, navigate])

  if (status === 'unauthenticated') return <Navigate to="/auth/login" replace />
  return <LoadingScreen label="Verifying your email…" />
}
