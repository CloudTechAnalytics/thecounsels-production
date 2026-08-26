import { Link } from 'react-router-dom'
import { APP } from '@/shared/config/env'
import { CounselMark } from '@/shared/components/counsel-mark'

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
 * Public, unauthenticated legal page — linked from the registration form's
 * "I agree to the Terms & Conditions" checkbox (previously a dead `href="#"`
 * link) and reachable directly at /terms. Opens in a new tab from
 * register-page.tsx so an in-progress signup form isn't lost.
 *
 * This is a drafted starting point, not reviewed by a lawyer — see the
 * conversation this was produced in. Whoever maintains this app should get
 * it reviewed by qualified Nigerian counsel before relying on it, given
 * this product handles law firms' own confidential client data and live
 * Naira payments.
 */
export function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/welcome" className="flex items-center gap-2">
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
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Effective {EFFECTIVE_DATE}. These Terms govern your access to and use of {APP.product}, a
          product of CloudTech Analytics ("CloudTech Analytics," "we," "us," or "our"). By creating an
          account, subscribing to a plan, or otherwise using {APP.product}, you agree to be bound by
          these Terms. If you are agreeing on behalf of a law firm or other organization, you represent
          that you have the authority to bind that organization, and "you" refers to both you and that
          organization.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Please also read our Privacy Policy, which explains how we collect, use, and protect personal
          data, including in relation to the Nigeria Data Protection Regulation (NDPR) and Nigeria Data
          Protection Act (NDPA).
        </p>

        <Section n={1} title="Definitions">
          <p>
            <strong className="text-foreground">"Service"</strong> means the {APP.product} web
            application, its associated APIs, and any related services provided by CloudTech Analytics.
          </p>
          <p>
            <strong className="text-foreground">"Organization" or "Firm"</strong> means the law firm,
            chambers, or legal practice that registers for the Service and under whose subscription
            individual Users operate.
          </p>
          <p>
            <strong className="text-foreground">"User"</strong> means any individual authorized by an
            Organization to access the Service under that Organization's account, including its
            Managing Partner, lawyers, and support staff.
          </p>
          <p>
            <strong className="text-foreground">"Client Data"</strong> means all data an Organization or
            its Users submit to, upload to, or generate within the Service in the course of managing
            their legal practice — including matter records, client and contact details, documents,
            time entries, billing records, notes, and communications. Client Data belongs to the
            Organization, not to CloudTech Analytics; see Section 9.
          </p>
          <p>
            <strong className="text-foreground">"Subscription"</strong> means an Organization's paid or
            trial access to a specific plan tier (currently Basic, Professional, Business, or
            Enterprise) as described at checkout or in the Platform Console.
          </p>
        </Section>

        <Section n={2} title="Eligibility &amp; Account Registration">
          <p>
            You must be at least 18 years old and capable of forming a binding contract to use the
            Service. When you register, you agree to provide accurate, current information and to keep
            your login credentials confidential. You are responsible for all activity that occurs under
            your account and under your Organization's account, whether or not you authorized it,
            except to the extent caused by our own breach of these Terms.
          </p>
          <p>
            The individual who registers an Organization is provisioned as its Managing Partner and is
            responsible for managing that Organization's Users, roles, and permissions from within the
            Service. CloudTech Analytics is not responsible for internal disputes between an
            Organization and its own Users over access, roles, or data within that Organization's
            workspace.
          </p>
        </Section>

        <Section n={3} title="Description of the Service">
          <p>
            {APP.product} is a practice-management platform for law firms, covering matters, clients,
            hearings, documents, tasks, time and billing, and related workflow and reporting tools. The
            Service is provided on a software-as-a-service basis and is not a law firm, does not provide
            legal advice, and does not create an attorney-client relationship between you and CloudTech
            Analytics.
          </p>
          <p>
            We may add, change, or remove features from the Service over time. We will not materially
            reduce the core functionality of a paid plan during an active billing period without
            reasonable notice.
          </p>
        </Section>

        <Section n={4} title="Free Trial">
          <p>
            New Organizations may be eligible for a free trial period (currently 30 days) on a
            designated trial plan, with no payment required to start. We may change the trial length,
            eligibility, or the plan offered on trial at any time, including for Organizations already
            mid-trial, without liability to you.
          </p>
          <p>
            At the end of a trial, if no active paid Subscription has been set up, your Organization's
            access to the Service will be suspended until a plan is selected and paid for. Data
            associated with your Organization is retained through the trial-expiry process described in
            Section 19, not deleted immediately.
          </p>
        </Section>

        <Section n={5} title="Subscription Plans, Fees &amp; Billing">
          <p>
            Paid Subscriptions are billed in Nigerian Naira (₦) on a monthly or annual cycle, at the
            rate shown for the selected plan at the time of purchase or renewal. Fees are exclusive of
            any applicable taxes unless stated otherwise, and you are responsible for any taxes assessed
            on your Subscription.
          </p>
          <p>
            Payments are processed by our third-party payment processor, Paystack. By subscribing, you
            authorize us (via Paystack) to charge your chosen payment method for the applicable fees on
            each billing cycle until you cancel. We do not store your full card details ourselves — they
            are handled directly by Paystack under its own terms and security standards.
          </p>
          <p>
            We may change plan pricing or introduce new plans at any time. For an existing paid
            Subscription, a price change will take effect no earlier than your next renewal date, and we
            will make reasonable efforts to notify you in advance.
          </p>
        </Section>

        <Section n={6} title="Cancellation, Downgrades &amp; Refunds">
          <p>
            You may cancel or change your Subscription at any time from Firm Settings. Cancellation
            takes effect at the end of your current billing period; you will not be charged again after
            that, and you retain access to paid features through the end of the period you already paid
            for.
          </p>
          <p>
            Except where required by law, fees already paid are non-refundable, including for partial
            billing periods, unused seats, or an early cancellation. If we discontinue the Service
            entirely, we will provide reasonable notice and, where reasonably practicable, a pro-rated
            refund for prepaid, unused time.
          </p>
        </Section>

        <Section n={7} title="Client Data Ownership &amp; Confidentiality">
          <p>
            As between you and CloudTech Analytics, your Organization owns all Client Data. We do not
            claim ownership over it, and we will not use it for any purpose other than providing,
            maintaining, and improving the Service to you and your Organization, unless you give us
            separate, explicit permission.
          </p>
          <p>
            We understand that Client Data may include information subject to legal professional
            privilege and confidentiality obligations owed by your Organization to its own clients. We
            will treat all Client Data as confidential, access it only where necessary to provide
            support you have requested or to maintain the security and integrity of the Service, and we
            will not disclose it to third parties except as described in our Privacy Policy or as
            required by law.
          </p>
          <p>
            You are responsible for ensuring that your Organization has the right to submit any Client
            Data to the Service, including any consents or authorizations required from your own
            clients.
          </p>
        </Section>

        <Section n={8} title="Data Protection">
          <p>
            We process personal data in accordance with our Privacy Policy and applicable Nigerian data
            protection law, including the NDPR and NDPA. Row-level security is applied throughout the
            Service so that one Organization's data is not accessible to another Organization.
          </p>
          <p>
            Where CloudTech Analytics processes personal data on your Organization's behalf as part of
            the Service, we act as a data processor and your Organization acts as the data controller
            for that data, in the sense those terms are used under applicable data protection law.
          </p>
        </Section>

        <Section n={9} title="Acceptable Use">
          <p>You agree not to, and not to permit any User to:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Use the Service for any unlawful purpose or in violation of any applicable law or professional conduct rule.</li>
            <li>Attempt to gain unauthorized access to another Organization's data, accounts, or any part of the Service's infrastructure.</li>
            <li>Reverse engineer, decompile, or attempt to extract the source code of the Service, except where applicable law expressly permits it.</li>
            <li>Interfere with or disrupt the integrity or performance of the Service, including by introducing malware or attempting denial-of-service attacks.</li>
            <li>Use the Service to store or transmit content that is unlawful, defamatory, or infringes a third party's intellectual property or privacy rights.</li>
            <li>Resell, sublicense, or provide access to the Service to any third party outside your own Organization without our written consent.</li>
          </ul>
          <p>We may suspend or terminate access for any User or Organization that violates this section.</p>
        </Section>

        <Section n={10} title="Firm Administrator Responsibilities">
          <p>
            Your Organization's administrators (Managing Partner and any role granted "manage" permissions)
            are responsible for: granting and revoking User access appropriately, promptly removing Users
            who leave the Organization, assigning roles that reflect each User's actual responsibilities,
            and configuring notification and billing settings correctly. CloudTech Analytics is not
            responsible for losses arising from an Organization's own misconfiguration of roles, permissions,
            or User access.
          </p>
        </Section>

        <Section n={11} title="Artificial Intelligence Features">
          <p>
            Certain plans include AI-assisted features (such as matter summaries and AI chat) powered by
            third-party large language models. These features are provided as a drafting and review aid
            only. They may be inaccurate, incomplete, or out of date, and they do not constitute legal
            advice. A qualified lawyer at your Organization must review any AI-generated content before
            relying on it or sharing it with a client or a court. You use AI features at your own risk,
            and CloudTech Analytics disclaims liability for decisions made in reliance on AI-generated
            output.
          </p>
        </Section>

        <Section n={12} title="Intellectual Property">
          <p>
            The Service, including its software, design, branding, and documentation (but excluding
            Client Data), is owned by CloudTech Analytics and its licensors and is protected by
            applicable intellectual property laws. We grant you a limited, non-exclusive,
            non-transferable license to access and use the Service for your Organization's internal
            legal practice management, subject to these Terms and payment of applicable fees. No other
            rights are granted.
          </p>
        </Section>

        <Section n={13} title="Third-Party Services">
          <p>
            The Service integrates with third-party providers, including Paystack (payments), email
            delivery providers, WhatsApp messaging providers where configured, and AI model providers.
            Your use of features backed by these providers is also subject to those providers' own
            terms. We are not responsible for the acts, omissions, or availability of third-party
            services we do not control.
          </p>
        </Section>

        <Section n={14} title="Service Availability &amp; Disclaimer of Warranties">
          <p>
            We aim to keep the Service available and reliable, but we do not guarantee uninterrupted or
            error-free operation, and the Service may be temporarily unavailable for maintenance,
            updates, or reasons outside our reasonable control.
          </p>
          <p>
            Except as expressly stated in these Terms, the Service is provided "as is" and "as
            available," without warranties of any kind, whether express, implied, or statutory,
            including any implied warranties of merchantability, fitness for a particular purpose, or
            non-infringement, to the fullest extent permitted by applicable law.
          </p>
        </Section>

        <Section n={15} title="Limitation of Liability">
          <p>
            To the fullest extent permitted by applicable law, CloudTech Analytics will not be liable
            for any indirect, incidental, special, consequential, or punitive damages, or for any loss
            of profits, revenue, data, goodwill, or business opportunity, arising out of or related to
            your use of the Service, even if we have been advised of the possibility of such damages.
          </p>
          <p>
            To the fullest extent permitted by applicable law, our total aggregate liability arising out
            of or relating to these Terms or the Service will not exceed the total fees actually paid by
            your Organization to CloudTech Analytics in the twelve (12) months immediately preceding the
            event giving rise to the claim.
          </p>
          <p>
            Nothing in these Terms limits liability for fraud, willful misconduct, or any other liability
            that cannot be excluded or limited under applicable law.
          </p>
        </Section>

        <Section n={16} title="Indemnification">
          <p>
            You agree to indemnify and hold CloudTech Analytics harmless from any claims, losses, and
            expenses (including reasonable legal fees) arising from your Organization's or a User's
            violation of these Terms, misuse of the Service, or violation of any applicable law or
            third-party right, including any claim arising from Client Data your Organization submitted
            to the Service.
          </p>
        </Section>

        <Section n={17} title="Suspension &amp; Termination">
          <p>
            We may suspend or terminate your access to the Service if: your Subscription payment fails
            and is not resolved within a reasonable grace period, your free trial ends without an active
            paid Subscription, you materially breach these Terms, or we are required to do so by law. We
            will make reasonable efforts to notify you before suspension where practicable.
          </p>
          <p>
            You may terminate your Organization's account at any time by canceling your Subscription and
            requesting account closure. Sections of these Terms that by their nature should survive
            termination (including Sections 7, 12, 15, 16, and 20) will continue to apply.
          </p>
        </Section>

        <Section n={18} title="Data Retention &amp; Export">
          <p>
            While your Organization's account is suspended for non-payment or an expired trial, your
            Client Data is retained, not deleted, so that you can resolve billing and regain access.
            Following account closure or extended suspension, we will retain Client Data for a
            reasonable period to allow for export or reactivation before it is permanently deleted from
            our systems, except where we are required to retain it longer for legal or regulatory
            reasons. You are responsible for exporting any data you wish to keep before that retention
            period ends.
          </p>
        </Section>

        <Section n={19} title="Changes to These Terms">
          <p>
            We may update these Terms from time to time. If we make material changes, we will provide
            reasonable notice, such as by email or an in-app notice, before the changes take effect.
            Continued use of the Service after the effective date of updated Terms constitutes acceptance
            of those changes.
          </p>
        </Section>

        <Section n={20} title="Governing Law &amp; Dispute Resolution">
          <p>
            These Terms are governed by the laws of the Federal Republic of Nigeria, without regard to
            conflict-of-law principles. Any dispute arising out of or relating to these Terms or the
            Service will first be addressed through good-faith negotiation between the parties, and, if
            unresolved, will be subject to the exclusive jurisdiction of the courts of Nigeria.
          </p>
        </Section>

        <Section n={21} title="Miscellaneous">
          <p>
            If any provision of these Terms is found unenforceable, the remaining provisions will
            continue in full force and effect. Our failure to enforce any provision is not a waiver of
            our right to do so later. You may not assign these Terms without our written consent; we may
            assign these Terms in connection with a merger, acquisition, or sale of assets. These Terms,
            together with our Privacy Policy, constitute the entire agreement between you and CloudTech
            Analytics regarding the Service.
          </p>
        </Section>

        <Section n={22} title="Contact Us">
          <p>
            Questions about these Terms can be sent to{' '}
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
