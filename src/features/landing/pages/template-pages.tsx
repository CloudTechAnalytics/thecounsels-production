import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { Button } from '@/shared/components/ui/button'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'
import { MaskWords, Rise, StaggerGrid } from '@/features/landing/components/motion-kit'
import { getTemplate, TEMPLATES, type TemplateDoc } from '@/features/landing/lib/templates'
import { NotFoundPage } from '@/features/landing/pages/not-found-page'
import { cn } from '@/shared/lib/utils'

const FormatIcon = ({ format, className }: { format: TemplateDoc['format']; className?: string }) =>
  format === 'Excel' ? <FileSpreadsheet className={className} /> : <FileText className={className} />

/** A small drawing of the downloaded file, so visitors see what they get before downloading. */
function Preview({ t }: { t: TemplateDoc }) {
  const p = t.preview
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
      <div className={cn('flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white', t.format === 'Excel' ? 'bg-[#1F7244]' : 'bg-[#2B5797]')}>
        <FormatIcon format={t.format} className="h-4 w-4" />
        {t.file.split('/').pop()}
      </div>
      {p.kind === 'sheet' ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr>
                {p.columns.map((c) => (
                  <th key={c} className="border border-border bg-[hsl(216_14%_13%)] px-3 py-2 font-semibold text-sidebar-foreground">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className={cn('border border-border px-3 py-2', /BALANCE|TOTAL/.test(cell) && 'font-semibold', /BALANCE/.test(r[1] ?? '') && 'bg-primary/15 font-semibold')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2.5 bg-background px-8 py-7">
          {p.lines.map((l, i) =>
            i === 0 ? (
              <p key={l} className="font-display text-lg font-semibold">
                {l}
              </p>
            ) : (
              <div key={l}>
                <p className="text-xs font-semibold text-primary">{l}</p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted" />
                <div className="mt-1 h-1.5 w-4/5 rounded-full bg-muted" />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function DownloadButton({ t, className }: { t: TemplateDoc; className?: string }) {
  return (
    <Button asChild size="lg" className={cn('rounded-full shadow-gold', className)}>
      <a href={t.file} download>
        <Download className="h-4 w-4" /> Download free ({t.format === 'Excel' ? '.xlsx' : '.docx'})
      </a>
    </Button>
  )
}

/** /templates — the hub listing every free template. */
export function TemplatesPage() {
  useSeo({
    title: 'Free Legal Templates for Law Firms: Invoice, Timesheet, Court Diary | The Counsel',
    description:
      'Free, editable templates for law firms: legal fee invoice, lawyer timesheet, court diary, retainer agreement and client intake form. Excel and Word, no sign-up needed.',
    canonicalPath: '/templates',
  })
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-4xl px-6 pb-14 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Free templates</p>
          <MaskWords as="h1" play text="Free legal templates for law firms" className="mt-3 font-display text-[2.1rem] font-semibold leading-[1.08] sm:text-5xl lg:text-6xl" />
          <Rise as="p" delay={0.35} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Practical, editable templates for the paperwork every practice runs on. Excel and Word, free to download, no sign-up needed.
          </Rise>
        </section>
        <section className="mx-auto max-w-6xl px-6 pb-20">
          <StaggerGrid className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((t) => (
              <Link key={t.slug} to={`/templates/${t.slug}`} className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elevated">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl text-white', t.format === 'Excel' ? 'bg-[#1F7244]' : 'bg-[#2B5797]')}>
                  <FormatIcon format={t.format} className="h-5 w-5" />
                </span>
                <h2 className="mt-5 font-display text-xl font-semibold">{t.name} template</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t.intro}</p>
                <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Free {t.format} download <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </p>
              </Link>
            ))}
          </StaggerGrid>
        </section>
        <SeoCtaBand heading="Or let The Counsel do the paperwork for you" />
      </main>
      <SiteFooter />
    </div>
  )
}

/** /templates/:slug — one template: what's inside, a preview, how to use it, guidance and FAQs. */
export function TemplatePage() {
  const { slug } = useParams()
  const t = getTemplate(slug)
  useSeo({
    title: t?.seoTitle ?? 'Template not found | The Counsel',
    description: t?.seoDescription ?? '',
    canonicalPath: t ? `/templates/${t.slug}` : '/templates',
  })
  if (!t) return <NotFoundPage />
  const others = TEMPLATES.filter((o) => o.slug !== t.slug)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: t.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
          }),
        }}
      />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 sm:pt-20 lg:grid-cols-2">
          <div>
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              <Link to="/templates" className="hover:text-primary">
                Free templates
              </Link>{' '}
              / {t.name}
            </nav>
            <MaskWords as="h1" play text={t.h1} className="mt-4 font-display text-[2.1rem] font-semibold leading-[1.08] sm:text-5xl" />
            <Rise as="p" delay={0.3} className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t.intro}
            </Rise>
            <Rise delay={0.4} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <DownloadButton t={t} />
              <span className="text-xs text-muted-foreground">Free · no sign-up · works in Excel, Word and Google Docs/Sheets</span>
            </Rise>
          </div>
          <Rise delay={0.2}>
            <Preview t={t} />
          </Rise>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-2">
            <div>
              <MaskWords as="h2" text="What's inside" className="font-display text-2xl font-semibold sm:text-3xl" />
              <StaggerGrid as="ul" className="mt-6 space-y-3">
                {t.includes.map((i) => (
                  <li key={i} className="flex items-start gap-3 text-sm sm:text-base">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {i}
                  </li>
                ))}
              </StaggerGrid>
            </div>
            <div>
              <MaskWords as="h2" text="How to use it" className="font-display text-2xl font-semibold sm:text-3xl" />
              <StaggerGrid as="ol" className="mt-6 space-y-4">
                {t.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-sm sm:text-base">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">{i + 1}</span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </StaggerGrid>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16">
          {t.guide.map((g) => (
            <div key={g.heading} className="mb-10 last:mb-0">
              <MaskWords as="h2" text={g.heading} className="font-display text-2xl font-semibold sm:text-3xl" />
              {g.body.map((b) => (
                <p key={b} className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {b}
                </p>
              ))}
            </div>
          ))}

          <Rise className="mt-12 rounded-2xl border border-primary/30 bg-primary/[0.06] p-6 sm:p-8">
            <p className="font-display text-xl font-semibold">Skip the spreadsheet</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{t.product.pitch}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="rounded-full shadow-gold">
                <Link to="/auth/register">
                  Try The Counsel free for 30 days <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-full border-border bg-transparent">
                <Link to={t.product.to}>{t.product.label}</Link>
              </Button>
            </div>
          </Rise>
        </section>

        <section className="border-t border-border bg-primary/[0.04]">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <MaskWords as="h2" text="Questions about this template" className="font-display text-2xl font-semibold sm:text-3xl" />
            <div className="mt-8 border-t border-border">
              {t.faqs.map((f) => (
                <details key={f.q} className="group border-b border-border py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-semibold marker:content-none">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-300 group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{f.a}</p>
                </details>
              ))}
            </div>
            <div className="mt-10 text-center">
              <DownloadButton t={t} />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <MaskWords as="h2" text="More free templates" className="font-display text-2xl font-semibold sm:text-3xl" />
          <StaggerGrid className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((o) => (
              <Link key={o.slug} to={`/templates/${o.slug}`} className="group rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-elevated">
                <FormatIcon format={o.format} className="h-5 w-5 text-primary" />
                <p className="mt-3 font-display text-base font-semibold">{o.name} template</p>
                <p className="mt-1 text-xs text-muted-foreground">Free {o.format} download</p>
              </Link>
            ))}
          </StaggerGrid>
        </section>

        <SeoCtaBand heading="Run your firm without the paperwork" />
      </main>
      <SiteFooter />
    </div>
  )
}
