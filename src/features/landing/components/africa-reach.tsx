import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Globe2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { COUNTRIES } from '@/features/onboarding/countries'

/** Round flag SVGs bundled from the `flag-icons` package (no third-party
 * image host at runtime). Keyed by lower-case ISO 3166-1 alpha-2 code. */
const FLAG_URLS = import.meta.glob('/node_modules/flag-icons/flags/1x1/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function flagUrl(code: string): string | undefined {
  return FLAG_URLS[`/node_modules/flag-icons/flags/1x1/${code}.svg`]
}

/** A handful of recognisable markets across every region, enough for a firm
 * anywhere on the continent to see itself in the picture. The full list is
 * the sign-up country picker (onboarding/countries.ts). */
const FEATURED: { name: string; code: string }[] = [
  { name: 'Nigeria', code: 'ng' },
  { name: 'Ghana', code: 'gh' },
  { name: 'Kenya', code: 'ke' },
  { name: 'South Africa', code: 'za' },
  { name: 'Egypt', code: 'eg' },
  { name: 'Senegal', code: 'sn' },
  { name: 'Tanzania', code: 'tz' },
  { name: 'Uganda', code: 'ug' },
  { name: 'Rwanda', code: 'rw' },
  { name: 'Zambia', code: 'zm' },
  { name: 'Morocco', code: 'ma' },
  { name: 'Cameroon', code: 'cm' },
]

const NON_AFRICAN = new Set(['United Kingdom', 'United States', 'Canada', 'United Arab Emirates', 'India', 'Other'])
/** African countries in the sign-up list, derived so the number never drifts. */
export const AFRICA_TOTAL = COUNTRIES.filter((c) => !NON_AFRICAN.has(c)).length
const MORE = AFRICA_TOTAL - FEATURED.length

function FlagTile({ name, code, delay }: { name: string; code: string; delay: number }) {
  const reduce = useReducedMotion()
  const url = flagUrl(code)
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.92 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="group flex w-24 flex-col items-center gap-3 sm:w-28"
    >
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-background p-[3px] shadow-card ring-1 ring-border transition-transform duration-300 group-hover:-translate-y-1.5 group-hover:ring-primary/60 sm:h-[72px] sm:w-[72px]">
        {url ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            width={72}
            height={72}
            className="h-full w-full rounded-full object-cover"
          />
        ) : null}
      </span>
      <span className="text-center text-sm font-medium leading-tight text-foreground">{name}</span>
    </motion.li>
  )
}

/** "Across Africa" band for the landing page: a curated set of flags that
 * tells a firm anywhere on the continent this was built for it too. */
export function AfricaReach() {
  const reduce = useReducedMotion()
  return (
    <section id="africa" className="relative overflow-hidden border-y border-border bg-card/50">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 top-10 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 bottom-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Globe2 className="h-4 w-4" /> Across Africa
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Wherever your chambers sits, The Counsel fits
          </h2>
          <p className="mt-4 text-muted-foreground">
            From Lagos to Nairobi to Johannesburg, one workspace for your matters, hearings, documents and
            billing, with roles and branches for your whole team.
          </p>
        </div>

        <ul className="mx-auto mt-14 flex flex-wrap justify-center gap-x-4 gap-y-9 sm:gap-x-6">
          {FEATURED.map((c, i) => (
            <FlagTile key={c.code} name={c.name} code={c.code} delay={i * 0.05} />
          ))}
          <motion.li
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.92 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5, delay: FEATURED.length * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-24 flex-col items-center gap-3 sm:w-28"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-primary/50 bg-primary/10 font-display text-lg font-semibold text-primary sm:h-[72px] sm:w-[72px]">
              +{MORE}
            </span>
            <span className="text-center text-sm font-medium leading-tight text-foreground">more countries</span>
          </motion.li>
        </ul>

        <div className="mt-14 flex flex-col items-center gap-4 text-center">
          <p className="max-w-xl text-sm text-muted-foreground">
            Firms can sign up from {AFRICA_TOTAL} African countries today. Billing is live in naira, and more
            African currencies are on the way. Practise somewhere else? Pick &ldquo;Other&rdquo; and tell us
            where.
          </p>
          <Button asChild size="lg">
            <Link to="/auth/register">
              Start your 30-day free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
