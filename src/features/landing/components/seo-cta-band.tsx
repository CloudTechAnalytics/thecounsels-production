import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { CounselMark } from '@/shared/components/counsel-mark'
import { MaskWords, NightSection, Rise } from '@/features/landing/components/motion-kit'

const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'

/** Shared closing CTA band for the SEO content pages — request a demo or start a trial. */
export function SeoCtaBand({ heading }: { heading: string }) {
  return (
    <NightSection edges="top" className="mt-8">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-28">
        <Rise y={16}>
          <CounselMark className="mx-auto h-12 w-12" />
        </Rise>
        <MaskWords text={heading} className="mt-6 font-display text-3xl font-semibold leading-tight sm:text-5xl" />
        <Rise delay={0.2}>
          <p className="mx-auto mt-5 max-w-xl text-sm text-sidebar-muted sm:text-base">
            Start a free 30-day trial, no card required, or book a short demo with our team.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild size="lg" className="rounded-full shadow-gold">
              <Link to="/auth/register">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
            >
              <a href={`mailto:${CONTACT_EMAIL}?subject=The Counsel — demo request`}>Request a Demo</a>
            </Button>
          </div>
        </Rise>
      </div>
    </NightSection>
  )
}
