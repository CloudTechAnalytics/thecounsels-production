import { Link } from 'react-router-dom'
import { APP } from '@/shared/config/env'
import { CounselMark } from '@/shared/components/counsel-mark'
import { useSeo } from '@/shared/hooks/use-seo'

const EFFECTIVE_DATE = 'August 20, 2026'
const CONTACT_EMAIL = 'cloudtechanalytics.consultant@gmail.com'
const CONTACT_PHONE = '+234 813 386 0143'

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold text-foreground">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/**
 * Public, unauthenticated legal page — companion to /terms, which
 * references "our Privacy Policy" by name in several places (Sections 0,
 * 7, 8, 21 of that page) without this page having existed yet. Linked
 * from the registration form's terms checkbox and reachable directly at
 * /privacy. Opens in a new tab, same as the Terms page, so an in-progress
 * signup form isn't lost.
 *
 * This is a drafted starting point, not reviewed by a lawyer — see the
 * conversation this was produced in. Whoever maintains this app should get
 * it reviewed by qualified Nigerian counsel before relying on it, given
 * this product handles law firms' own confidential client data.
 */
export function PrivacyPage() {
  useSeo({
    title: 'Privacy Policy | The Counsel',
    description: `Privacy Policy explaining how ${APP.product}, a product of CloudTech Analytics, collects, uses and protects personal data.`,
    canonicalPath: '/privacy',
  })
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <CounselMark variant="small" className="h-8 w-8" />
            <span className="font-display text-base font-semibold">{APP.product}</span>
          </Link>
          <Link to="/auth/register" className="text-sm font-medium text-primary hover:underline">
            Back to sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Legal</p>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}. This Privacy Policy explains how CloudTech Analytics ("CloudTech
          Analytics," "we," "us," or "our") collects, uses, discloses, and protects personal data in
          connection with {APP.product}. It should be read alongside our{' '}
          <Link to="/terms" className="font-medium text-primary hover:underline">
            Terms &amp; Conditions
          </Link>
          , which governs your use of the Service more broadly.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          We process personal data in accordance with the Nigeria Data Protection Regulation (NDPR) and
          the Nigeria Data Protection Act (NDPA). Where any part of the Service is used by someone outside
          Nigeria, we apply the same standard set out here regardless of the additional protections your
          own local law may separately provide.
        </p>

        <Section n={1} title="Two Kinds of Data, Two Roles">
          <p>
            This Policy covers two categories of personal data, and our role is different for each:
          </p>
          <p>
            <strong className="text-foreground">Account Data</strong> — information about you as a user of
            the Service: your name, work email, phone number, role, and how you use the platform. For
            Account Data, CloudTech Analytics is the <strong className="text-foreground">data controller</strong>
            — we decide why and how it's processed, as described in this Policy.
          </p>
          <p>
            <strong className="text-foreground">Client Data</strong> — everything your Organization submits
            to, uploads to, or generates within the Service in the course of managing its own legal
            practice: matter records, client and contact details, documents, notes, time entries, and
            billing records. For Client Data, your Organization is the{' '}
            <strong className="text-foreground">data controller</strong> and CloudTech Analytics is the{' '}
            <strong className="text-foreground">data processor</strong>, acting only on your Organization's
            instructions (as configured through the Service) and never using it for our own independent
            purposes. If you are a client of one of our Organizations and have questions about your own
            information within Client Data, please contact that firm directly — we act on their
            instructions, not yours.
          </p>
        </Section>

        <Section n={2} title="Information We Collect">
          <p>We collect the following categories of information:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-foreground">Account &amp; profile information</strong> — full name,
              work email, phone number, avatar, role, and organization/branch assignment, provided when you
              or your Organization's administrator create your account.
            </li>
            <li>
              <strong className="text-foreground">Client Data</strong> — as described in Section 1, submitted
              by your Organization. This may include information subject to legal professional privilege.
            </li>
            <li>
              <strong className="text-foreground">Payment information</strong> — handled directly by our
              payment processor, Paystack. We receive and store confirmation of a successful payment and
              your subscription status, never your full card or bank details.
            </li>
            <li>
              <strong className="text-foreground">Usage &amp; device information</strong> — pages visited,
              actions taken (recorded in the in-app audit log), IP address, browser and device type, and
              similar diagnostic data, including client-side error reports (message, stack trace, and the
              page URL where an error occurred) used to find and fix bugs.
            </li>
            <li>
              <strong className="text-foreground">Support communications</strong> — the content of support
              tickets and messages you send us, and, where applicable, the reason logged for a support
              access session (see Section 6).
            </li>
          </ul>
        </Section>

        <Section n={3} title="How We Use Information">
          <p>We use Account Data and usage information to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Provide, operate, and maintain the Service, including authentication and access control.</li>
            <li>Process subscriptions, billing, and payment confirmations.</li>
            <li>Send transactional communications — notifications you've configured, hearing/task reminders, billing receipts, and support replies.</li>
            <li>Diagnose and fix bugs, monitor performance, and improve the Service.</li>
            <li>Detect, investigate, and prevent fraud, abuse, or security incidents.</li>
            <li>Comply with our own legal obligations.</li>
          </ul>
          <p>
            We process Client Data solely to provide the Service to your Organization, as instructed by
            your Organization through its configuration and use of the platform — never for advertising,
            never sold, and never used to train a model that isn't your Organization's own use of an
            AI feature (see Section 6).
          </p>
        </Section>

        <Section n={4} title="Legal Basis for Processing">
          <p>Under the NDPR/NDPA, we rely on the following legal bases:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong className="text-foreground">Performance of a contract</strong> — processing needed to provide the Service you or your Organization signed up for.</li>
            <li><strong className="text-foreground">Legitimate interest</strong> — for security, fraud prevention, diagnostics, and improving the Service, balanced against your rights.</li>
            <li><strong className="text-foreground">Consent</strong> — for optional channels you enable yourself, such as browser push notifications or WhatsApp reminders.</li>
            <li><strong className="text-foreground">Legal obligation</strong> — where we're required to retain or disclose information by law.</li>
          </ul>
        </Section>

        <Section n={5} title="Cookies &amp; Local Storage">
          <p>
            The Service uses your browser's local storage (not third-party advertising cookies) to keep you
            signed in, remember your active organization and a few interface preferences, and — for
            Supabase Auth — to manage your session. We do not use third-party advertising or cross-site
            tracking cookies within the authenticated application.
          </p>
        </Section>

        <Section n={6} title="AI Features">
          <p>
            Plans that include AI features (matter summaries, AI chat, the scheduling assistant) send the
            relevant matter or query content to a third-party AI model provider (currently Groq) in order
            to generate a response. That content is processed by the provider to return a result to you and
            is subject to that provider's own data-handling terms for API access, which do not include using
            API-submitted content to train their own models. We do not
            send more than what's needed to answer the specific request (e.g. a matter's own status, tasks,
            and hearings — not your whole Organization's data at once). See Section 11 of our Terms for the
            "review before relying on it" limits on AI output itself.
          </p>
        </Section>

        <Section n={7} title="Sub-Processors &amp; Third-Party Service Providers">
          <p>We use the following categories of service providers to operate the Service. Each only receives what it needs to perform its function:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong className="text-foreground">Supabase</strong> — database, authentication, file storage, and backend infrastructure. This is where Account Data and Client Data are stored.</li>
            <li><strong className="text-foreground">Vercel</strong> — hosting for the web application itself.</li>
            <li><strong className="text-foreground">Paystack</strong> — payment processing for subscriptions.</li>
            <li><strong className="text-foreground">Resend</strong> — delivery of transactional emails (notifications, reminders, receipts).</li>
            <li><strong className="text-foreground">Groq</strong> — AI features, as described in Section 6, where your Organization's plan includes them.</li>
            <li><strong className="text-foreground">WhatsApp messaging providers</strong> (Twilio or Meta, whichever is configured) — only if you personally enable WhatsApp reminders and provide a number.</li>
          </ul>
          <p>
            We do not sell personal data to anyone, and we do not share Client Data with any third party
            beyond what's listed here except where required by law or with your Organization's separate,
            explicit permission.
          </p>
        </Section>

        <Section n={8} title="International Data Transfers">
          <p>
            Our database infrastructure is hosted on servers located in the European Union. Some of our
            service providers (including our AI features provider, where used) may process data outside
            Nigeria and the EU. Where personal data is transferred internationally, we rely on our
            providers' own standard contractual and security safeguards.
          </p>
        </Section>

        <Section n={9} title="Data Security">
          <p>
            We apply row-level security at the database layer so that one Organization's data is never
            accessible to another Organization, encrypt data in transit, and restrict internal access to
            what's needed to operate and support the Service. No method of transmission or storage is
            100% secure, and we cannot guarantee absolute security — but we treat Client Data with the
            confidentiality it warrants, per Section 7 of our Terms.
          </p>
        </Section>

        <Section n={10} title="Data Retention">
          <p>
            We retain Account Data for as long as your account is active, and Client Data for as long as
            your Organization's subscription or account remains active — including through a suspended or
            expired-trial state, so you can resolve billing and regain access without losing anything.
            Following account closure, we retain data for a reasonable period to allow export or
            reactivation before permanent deletion, except where we're required to retain it longer for
            legal or regulatory reasons. See Section 18 of our Terms for the full detail.
          </p>
        </Section>

        <Section n={11} title="Support Access Sessions">
          <p>
            Our support staff do not have standing access to your Organization's workspace. Accessing it
            for support purposes requires your Organization's own administrator to explicitly grant a
            time-limited, fully audited session — every such session, and the reason given for it, is
            logged and visible to your Organization.
          </p>
        </Section>

        <Section n={12} title="Your Rights">
          <p>Subject to applicable law, you have the right to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate or incomplete data.</li>
            <li>Request deletion of your data, subject to our retention obligations described above.</li>
            <li>Object to or request that we restrict certain processing.</li>
            <li>Receive a copy of your data in a portable format.</li>
            <li>Withdraw consent at any time for processing that relies on it (e.g. disabling WhatsApp or browser notifications).</li>
          </ul>
          <p>
            To exercise any of these rights over your own Account Data, contact us using the details in
            Section 15. If your request concerns Client Data held within an Organization's workspace,
            we'll direct you to that Organization, since they control that data — you're also welcome to
            lodge a complaint with Nigeria's Data Protection Commission (NDPC) at any time.
          </p>
        </Section>

        <Section n={13} title="Children's Privacy">
          <p>
            The Service is intended for use by legal professionals and their staff and is not directed at
            or knowingly used by anyone under 18. We do not knowingly collect personal data from children.
          </p>
        </Section>

        <Section n={14} title="Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will
            provide reasonable notice, such as by email or an in-app notice, before the changes take
            effect. Continued use of the Service after the effective date of an updated Policy constitutes
            acceptance of those changes.
          </p>
        </Section>

        <Section n={15} title="Contact Us">
          <p>
            Questions about this Privacy Policy, or requests relating to your personal data, can be sent
            to{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>{' '}
            or {CONTACT_PHONE}.
          </p>
        </Section>
      </main>
    </div>
  )
}
