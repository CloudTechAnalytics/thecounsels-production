import { Link } from 'react-router-dom'
import { FileText, Users, FolderOpen, StickyNote, CheckSquare, Gavel, History, BarChart3 } from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'

const LIFECYCLE = [
  {
    icon: FileText,
    title: 'Open a matter',
    text: 'A new matter gets its own number automatically, a status of "open", and a lead lawyer and responsible partner assigned from the start — never an untracked case living only in someone\'s inbox.',
  },
  {
    icon: Users,
    title: 'Build the team around it',
    text: 'Add an assigned team beyond the lead lawyer — associates, paralegals, anyone working the matter — each shown with their role, and scoped to the right branch for multi-office firms.',
  },
  {
    icon: FolderOpen,
    title: 'Attach documents',
    text: 'Contracts, filings, correspondence and evidence live against the matter itself, in access-controlled storage, viewable in-app for common file types.',
  },
  {
    icon: StickyNote,
    title: 'Keep notes as the case develops',
    text: 'Add matter notes as work happens, so the case history isn\'t reconstructed later from memory or from a lawyer\'s personal notebook.',
  },
  {
    icon: CheckSquare,
    title: 'Track tasks against it',
    text: 'Tasks link back to the matter they belong to, with an owner, a due date and a priority — visible to the team, not just the person who created them.',
  },
  {
    icon: Gavel,
    title: 'Log hearings and outcomes',
    text: 'Every hearing records its type, status and outcome, with the assigned lawyer and any supporting lawyers on record, and shows up on the firm\'s shared calendar automatically.',
  },
  {
    icon: History,
    title: 'See the full timeline',
    text: 'Every status change, document upload, note and hearing is captured in the matter\'s own timeline — a real audit trail, not a reconstruction after the fact.',
  },
  {
    icon: BarChart3,
    title: 'Move it toward closed',
    text: 'A matter moves from open through pending and, where relevant, in court, to closed — won or lost — and that status feeds directly into the firm\'s reporting without anyone updating a separate tracker.',
  },
]

/** SEO landing page targeting "legal case management software" and close variants. */
export function LegalCaseManagementSoftwarePage() {
  useSeo({
    title: 'Legal Case Management Software | The Counsel',
    description:
      'Manage legal cases and matters in one place with The Counsel — status tracking, assigned lawyers, documents, notes, tasks, hearings and a full audit trail per matter.',
    canonicalPath: '/legal-case-management-software',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Case Management</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Manage Legal Cases and Matters in One Place
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            A matter in The Counsel isn't just a folder name — it's a numbered record that carries its own
            status, team, documents, notes, tasks, hearings and complete history from the day it's opened to
            the day it's closed.
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">A case, from intake to close</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Here's what following a single matter through the system actually looks like:
          </p>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {LIFECYCLE.map((step, i) => (
              <div key={step.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
                <div className="mb-4 flex items-center gap-3">
                  <span className="font-display text-3xl font-semibold text-primary/25">0{i + 1}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <step.icon className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-4xl px-6 py-16">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">Why case status matters</h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Because status, assignment and activity are all tracked on the matter itself rather than in a
              separate tracker someone has to keep in sync, a partner can see the real state of the whole
              caseload — what's open, what's in court, what's stalled — without pulling every lawyer aside
              for an update. That same status data feeds straight into{' '}
              <Link to="/legal-practice-management-software-nigeria" className="text-primary hover:underline">
                firm-wide reporting
              </Link>
              , and once a matter starts generating billable work, into{' '}
              <Link to="/law-firm-billing-software" className="text-primary hover:underline">
                billing and invoicing
              </Link>{' '}
              too.
            </p>
          </div>
        </section>

        <SeoCtaBand heading="See how your caseload looks in one place" />
      </main>

      <SiteFooter />
    </div>
  )
}
