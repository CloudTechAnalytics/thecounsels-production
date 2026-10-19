import { Link, Navigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { useAuth } from '@/features/auth/context/auth-provider'
import { Button } from '@/shared/components/ui/button'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'

/**
 * Unknown URL. Signed-in users keep the old behaviour (back to the app);
 * visitors get a proper 404 with a way back instead of a silent redirect.
 */
export function NotFoundPage() {
  const { userId } = useAuth()
  useSeo({
    title: 'Page not found | The Counsel',
    description: 'This page could not be found.',
    canonicalPath: '/',
  })

  if (userId) return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="font-display text-6xl font-semibold text-primary">404</p>
        <h1 className="mt-4 font-display text-2xl font-semibold sm:text-3xl">This page isn&rsquo;t on the docket</h1>
        <p className="mt-3 text-muted-foreground">
          The link may be old or mistyped. Here are a few places to go instead.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className="shadow-gold">
            <Link to="/">
              Back home <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/features">Features</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/pricing">Pricing</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
