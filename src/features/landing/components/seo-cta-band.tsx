import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'

/** Shared closing CTA band for the SEO content pages — request a demo or start a trial. */
export function SeoCtaBand({ heading }: { heading: string }) {
  return (
    <section className="border-t border-border bg-card/60">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="font-display text-2xl font-semibold sm:text-3xl">{heading}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
          Start a free 30-day trial, no card required, or book a short demo with our team.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="shadow-gold">
            <Link to="/auth/register">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-border bg-transparent">
            <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`}>Request a Demo</a>
          </Button>
        </div>
      </div>
    </section>
  )
}
