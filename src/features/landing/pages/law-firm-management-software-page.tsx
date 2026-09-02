import { Link } from 'react-router-dom'
import {
  Users2,
  Briefcase,
  UserCog,
  FolderLock,
  CheckSquare,
  Gavel,
  Banknote,
  BarChart3,
  Building2,
  Lock,
  Layers,
} from 'lucide-react'
import { useSeo } from '@/shared/hooks/use-seo'
import { SiteHeader } from '@/features/landing/components/site-header'
import { SiteFooter } from '@/features/landing/components/site-footer'
import { SeoCtaBand } from '@/features/landing/components/seo-cta-band'

const AREAS = [
  { icon: Users2, title: 'Clients', text: 'A single record per client — individual or corporate — with every matter, contact and piece of correspondence linked to it, instead of scattered across separate files.' },
  { icon: Briefcase, title: 'Matters', text: 'Every matter numbered, statused and assigned, so a partner can see the state of the whole caseload without asking each lawyer for an update.' },
  { icon: UserCog, title: 'Lawyers & staff', text: 'A roster of every lawyer and staff member — bar details, qualifications and current workload — so leadership can see who has capacity and who’s stretched.' },
  { icon: FolderLock, title: 'Documents', text: 'Firm-wide or matter-specific document storage, access-controlled by role, with common file types viewable inside the app.' },
  { icon: CheckSquare, title: 'Tasks', text: 'Work assigned with owners and deadlines, so follow-ups don’t depend on someone remembering to chase them.' },
  { icon: Gavel, title: 'Hearings', text: 'Court dates and outcomes tracked against the matter they belong to and reflected on a shared calendar.' },
  { icon: Banknote, title: 'Billing', text: 'Time, expenses, invoices and payments in one place, in naira, so finance isn’t reconciling a separate spreadsheet against what lawyers logged.' },
  { icon: BarChart3, title: 'Reports', text: 'Firm-wide reporting for the roles who should see it — financial performance, productivity, and the state of the caseload.' },
  { icon: Building2, title: 'Branches', text: 'For firms with more than one office, scope members and matters to a branch while leadership retains a firm-wide view.' },
  { icon: Lock, title: 'Permissions', text: 'Role-based access means a paralegal, an associate and a managing partner each see exactly what their role calls for — nothing more.' },
]

/** SEO landing page targeting "law firm management software" and close variants. */
export function LawFirmManagementSoftwarePage() {
  useSeo({
    title: 'Law Firm Management Software | The Counsel',
    description:
      'The Counsel is law firm management software that brings clients, matters, lawyers, documents, tasks, hearings, billing and reporting into one workspace for modern legal practices.',
    canonicalPath: '/law-firm-management-software',
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      <main>
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Law Firm Management</p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Law Firm Management Software for Modern Legal Practices
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Running a firm means managing more than any one case — it's the people, the workload across the
            whole team, the documents everyone needs access to, and the numbers leadership needs to see. The
            Counsel is built around all of that at once, not just the case file.
          </p>
        </section>

        <section className="mx-auto max-w-4xl px-6 pb-16">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Layers className="h-5 w-5" />
            </span>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">One system, the whole firm</h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Most firms don't lack tools — they have too many disconnected ones: a spreadsheet for matters,
            a shared drive for documents, a separate billing sheet, and a WhatsApp group standing in for a
            task list. The Counsel replaces that patchwork with one workspace where a logged hour becomes an
            invoice, a closed matter updates the firm's reporting automatically, and every team member's
            access is set by their actual role — no manual coordination required to keep it all consistent.
          </p>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">
              What you manage day to day
            </h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {AREAS.map((a) => (
                <div key={a.title} className="rounded-xl border border-border bg-card p-6 shadow-card">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <a.icon className="h-5 w-5" />
                  </span>
                  <h3 className="font-display text-lg font-semibold">{a.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="font-display text-2xl font-semibold sm:text-3xl">Built to grow with the firm</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            A solo practitioner and a twenty-partner chambers use the same system, scoped differently — more
            users, more branches, and finer-grained reporting as the firm grows, without switching tools
            partway through. For the pieces that deserve a closer look, see{' '}
            <Link to="/legal-practice-management-software-nigeria" className="text-primary hover:underline">
              legal practice management for Nigerian firms
            </Link>
            ,{' '}
            <Link to="/legal-case-management-software" className="text-primary hover:underline">
              case management workflows
            </Link>{' '}
            and{' '}
            <Link to="/law-firm-billing-software" className="text-primary hover:underline">
              billing &amp; invoicing
            </Link>
            .
          </p>
        </section>

        <SeoCtaBand heading="Give your whole firm one place to work" />
      </main>

      <SiteFooter />
    </div>
  )
}
