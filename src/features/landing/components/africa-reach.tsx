import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Globe2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

/** Flag SVGs bundled from the `flag-icons` package (no third-party image
 * host at runtime). Keyed by lower-case ISO 3166-1 alpha-2 code. */
const FLAG_URLS = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

function flagUrl(code: string): string | undefined {
  return FLAG_URLS[`/node_modules/flag-icons/flags/4x3/${code}.svg`]
}

type Country = { name: string; code: string }

/** Mirrors the African entries of src/features/onboarding/countries.ts, the
 * list a firm can actually pick when it signs up. Keep the two in sync. */
const REGIONS: { region: string; countries: Country[] }[] = [
  {
    region: 'West Africa',
    countries: [
      { name: 'Nigeria', code: 'ng' },
      { name: 'Ghana', code: 'gh' },
      { name: 'Sierra Leone', code: 'sl' },
      { name: 'Liberia', code: 'lr' },
      { name: 'Senegal', code: 'sn' },
      { name: 'Côte d’Ivoire', code: 'ci' },
      { name: 'Togo', code: 'tg' },
      { name: 'Benin', code: 'bj' },
      { name: 'Guinea', code: 'gn' },
      { name: 'Guinea-Bissau', code: 'gw' },
      { name: 'Gambia', code: 'gm' },
      { name: 'Mali', code: 'ml' },
      { name: 'Burkina Faso', code: 'bf' },
      { name: 'Niger', code: 'ne' },
      { name: 'Cabo Verde', code: 'cv' },
    ],
  },
  {
    region: 'East Africa',
    countries: [
      { name: 'Kenya', code: 'ke' },
      { name: 'Tanzania', code: 'tz' },
      { name: 'Uganda', code: 'ug' },
      { name: 'Rwanda', code: 'rw' },
      { name: 'Ethiopia', code: 'et' },
      { name: 'Burundi', code: 'bi' },
      { name: 'South Sudan', code: 'ss' },
      { name: 'Somalia', code: 'so' },
      { name: 'Djibouti', code: 'dj' },
    ],
  },
  {
    region: 'Southern Africa',
    countries: [
      { name: 'South Africa', code: 'za' },
      { name: 'Zimbabwe', code: 'zw' },
      { name: 'Zambia', code: 'zm' },
      { name: 'Botswana', code: 'bw' },
      { name: 'Namibia', code: 'na' },
      { name: 'Mozambique', code: 'mz' },
      { name: 'Malawi', code: 'mw' },
      { name: 'Lesotho', code: 'ls' },
      { name: 'Eswatini', code: 'sz' },
    ],
  },
  {
    region: 'North Africa',
    countries: [
      { name: 'Egypt', code: 'eg' },
      { name: 'Morocco', code: 'ma' },
      { name: 'Tunisia', code: 'tn' },
      { name: 'Algeria', code: 'dz' },
      { name: 'Libya', code: 'ly' },
      { name: 'Sudan', code: 'sd' },
    ],
  },
  {
    region: 'Central Africa',
    countries: [
      { name: 'Cameroon', code: 'cm' },
      { name: 'DR Congo', code: 'cd' },
      { name: 'Rep. of the Congo', code: 'cg' },
      { name: 'Gabon', code: 'ga' },
      { name: 'Chad', code: 'td' },
      { name: 'Central African Rep.', code: 'cf' },
      { name: 'Equatorial Guinea', code: 'gq' },
    ],
  },
]

const COUNTRY_COUNT = REGIONS.reduce((n, r) => n + r.countries.length, 0)

function Flag({ country, delay }: { country: Country; delay: number }) {
  const reduce = useReducedMotion()
  const url = flagUrl(country.code)
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="flex items-center gap-2.5 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm transition-shadow hover:shadow-elevated"
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          width={24}
          height={18}
          className="h-[18px] w-6 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10"
        />
      ) : null}
      <span className="whitespace-nowrap text-sm font-medium">{country.name}</span>
    </motion.li>
  )
}

/** "Across Africa" band for the landing page: a flag for every country a
 * firm can sign up from today, grouped by region. */
export function AfricaReach() {
  return (
    <section id="africa" className="relative overflow-hidden border-y border-border bg-card/50">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <Globe2 className="h-4 w-4" /> Across Africa
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            One platform for law firms from Lagos to Nairobi to Johannesburg
          </h2>
          <p className="mt-4 text-muted-foreground">
            Wherever your chambers sits, you get the same workspace: matters, hearings, documents and
            billing in one place, with roles and branches for your whole team. Firms can sign up from
            all {COUNTRY_COUNT} of these countries today.
          </p>
        </div>

        <div className="mt-12 space-y-8">
          {REGIONS.map((r, ri) => (
            <div key={r.region}>
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-left">
                {r.region}
              </p>
              <ul className="flex flex-wrap justify-center gap-2.5 sm:justify-start">
                {r.countries.map((c, ci) => (
                  <Flag key={c.code} country={c} delay={Math.min(ri * 0.04 + ci * 0.025, 0.5)} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <p className="max-w-xl text-sm text-muted-foreground">
            Billing is live in naira today, and more African currencies are on the way. Not seeing your
            country? Choose &ldquo;Other&rdquo; when you sign up and tell us where you practise.
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
