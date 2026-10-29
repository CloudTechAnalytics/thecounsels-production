import { Link } from 'react-router-dom'
import { Banknote, BarChart3, Briefcase, CheckCircle2, ChevronDown, FolderLock, Gavel, KeyRound, MapPin, ShieldCheck, Users } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { MaskWords, Rise, StaggerGrid } from '@/features/landing/components/motion-kit'
import { COUNTRIES, getCountry } from '@/features/landing/lib/countries'
import { TEMPLATES } from '@/features/landing/lib/templates'

const MODULES = [
  { icon: Briefcase, title: 'Matters', text: 'Numbered, statused and timelined, with documents, notes and tasks attached.' },
  { icon: Users, title: 'Clients', text: 'Individuals and companies, with every matter they are connected to.' },
  { icon: Gavel, title: 'Hearings & calendar', text: 'Every court date on one firm calendar, with reminders the day before.' },
  { icon: FolderLock, title: 'Documents', text: 'Stored per matter in private, access-controlled storage, viewable in the app.' },
  { icon: Banknote, title: 'Time & billing', text: 'Time and disbursements logged against matters, swept into invoices.' },
  { icon: BarChart3, title: 'Reports', text: 'Financial, productivity and matter reports, exportable to Excel.' },
  { icon: KeyRound, title: 'Roles & permissions', text: 'Each person sees what their role needs, nothing more.' },
  { icon: ShieldCheck, title: 'Security', text: 'Firm data isolated at the database level, with a full audit log.' },
]

/** Country landing page: /law-firm-software-<slug>. */
export function CountryPage({ slug }: { slug: string }) {
  const c = getCountry(slug)
  useSeo({ title: c.seoTitle, description: c.seoDescription, canonicalPath: `/law-firm-software-${c.slug}` })
  const others = COUNTRIES.filter((o) => o.slug !== c.slug)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: c.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
          }),
        }}
      />
      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-14 text-center sm:pt-20">
          <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            <MapPin className="h-3.5 w-3.5" /> {c.country}
          </p>
          <MaskWords as="h1" play text={c.h1} className="mt-3 font-display text-[2.1rem] font-semibold leading-[1.08] sm:text-5xl lg:text-6xl" />
          <Rise as="p" delay={0.35} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {c.intro}
          </Rise>
          <Rise as="p" delay={0.45} className="mt-4 text-sm text-muted-foreground">
            For firms in {c.cities}.
          </Rise>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <MaskWords as="h2" text={c.practice.heading} className="font-display text-2xl font-semibold sm:text-3xl" />
          {c.practice.body.map((p) => (
            <p key={p} className="mt-4 text-base leading-relaxed text-muted-foreground">
              {p}
            </p>
          ))}
          <MaskWords as="h2" text={`Courts your team appears in, all on one calendar`} className="mt-12 font-display text-2xl font-semibold sm:text-3xl" />
          <StaggerGrid as="ul" className="mt-6 grid gap-3 sm:grid-cols-2">
            {c.courts.map((ct) => (
              <li key={ct} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {ct}
              </li>
            ))}
          </StaggerGrid>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <MaskWords as="h2" text={`Everything a law firm in ${c.country} runs on`} className="text-center font-display text-2xl font-semibold sm:text-3xl" />
            <StaggerGrid className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {MODULES.map((m) => (
                <div key={m.title} className="rounded-xl border border-border bg-card p-5 shadow-card">
                  <m.icon className="h-5 w-5 text-primary" />
                  <h3 className="mt-3 font-display text-base font-semibold">{m.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
                </div>
              ))}
            </StaggerGrid>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <MaskWords as="h2" text={c.billing.heading} className="font-display text-2xl font-semibold sm:text-3xl" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{c.billing.body}</p>
          <MaskWords as="h2" text="Your clients' data, protected" className="mt-12 font-display text-2xl font-semibold sm:text-3xl" />
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{c.dataLaw}</p>
          <MaskWords as="h2" text="Free templates for your practice" className="mt-12 font-display text-2xl font-semibold sm:text-3xl" />
          <ul className="mt-5 space-y-2.5 text-sm">
            {TEMPLATES.map((t) => (
              <li key={t.slug} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <Link to={`/templates/${t.slug}`} className="text-primary hover:underline">
                  {t.name} template
                </Link>
                <span className="text-muted-foreground">({t.format}, free)</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border bg-primary/[0.04]">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <MaskWords as="h2" text={`Questions from firms in ${c.country}`} className="font-display text-2xl font-semibold sm:text-3xl" />
            <div className="mt-8 border-t border-border">
              {c.faqs.map((f) => (
                <details key={f.q} className="group border-b border-border py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold marker:content-none">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{f.a}</p>
                </details>
              ))}
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              Also for firms in{' '}
              {others.map((o, i) => (
                <span key={o.slug}>
                  <Link to={`/law-firm-software-${o.slug}`} className="text-primary hover:underline">
                    {o.country}
                  </Link>
                  {i < others.length - 2 ? ', ' : i === others.length - 2 ? ' and ' : ''}
                </span>
              ))}
              , and{' '}
              <Link to="/legal-practice-management-software-africa" className="text-primary hover:underline">
                across Africa
              </Link>
              .
            </p>
          </div>
        </section>

        <SeoCtaBand heading={`Run your ${c.country} practice on one system`} />
      </main>
      <SiteFooter />
    </div>
  )
}
