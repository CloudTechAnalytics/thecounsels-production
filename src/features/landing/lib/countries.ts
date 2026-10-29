/**
 * Country landing pages (/law-firm-software-<slug>). Copy is deliberately
 * honest about what works where today: every module works in every country,
 * but subscriptions and firm invoices are in naira only until more
 * currencies are enabled on the payment account (see shared/lib/currencies.ts).
 * Update `billing` here the day that changes.
 */
export interface CountryDoc {
  slug: string
  country: string
  seoTitle: string
  seoDescription: string
  h1: string
  intro: string
  cities: string
  /** How practice works there, in the firm's own terms. */
  practice: { heading: string; body: string[] }
  courts: string[]
  billing: { heading: string; body: string }
  dataLaw: string
  faqs: { q: string; a: string }[]
}

const NAIRA_ONLY = (currency: string) =>
  `Every part of The Counsel works for firms in this country today: clients, matters, documents, hearings, tasks, staff, HR and reports. One thing is still on the way: subscriptions and the invoices you raise in The Counsel are in Nigerian naira for now, with ${currency} coming. Until then, firms that bill clients in ${currency} usually run everything else in The Counsel and keep invoicing in their current tool.`

export const COUNTRIES: CountryDoc[] = [
  {
    slug: 'nigeria',
    country: 'Nigeria',
    seoTitle: 'Law Firm Software in Nigeria: Practice Management for Nigerian Law Firms | The Counsel',
    seoDescription:
      'Practice management software for law firms in Nigeria. Matters, clients, court dates, documents, time and naira invoicing in one secure system. Free 30-day trial.',
    h1: 'Law firm software for Nigerian law firms',
    intro:
      'The Counsel brings a Nigerian practice’s matters, clients, court dates, documents, time and naira invoices into one secure workspace, so nothing depends on a group chat, a shared drive or one person’s diary.',
    cities: 'Lagos, Abuja, Port Harcourt, Ibadan, Kano, Enugu and across the country',
    practice: {
      heading: 'Built around how Nigerian chambers actually work',
      body: [
        'In most Nigerian firms, the hearing date lives in a lawyer’s diary, the latest hearing notice sits in someone’s email, and the team finds out about adjournments in a WhatsApp group. The Counsel gives every hearing a home on one shared calendar, and reminds everyone on the matter the day before, by email and WhatsApp.',
        'Matters are numbered automatically with a status (open, pending, in court, closed), a lead lawyer and the full history of what happened. Time is logged against the matter as the work is done and swept into a naira invoice, so billing no longer means rebuilding the month from memory.',
      ],
    },
    courts: [
      'Supreme Court and Court of Appeal',
      'Federal High Court',
      'High Courts of the States and the FCT',
      'National Industrial Court',
      'Magistrates’ and Customary Courts',
      'Arbitration and other tribunals',
    ],
    billing: {
      heading: 'Naira billing, built in',
      body: 'Log billable time and disbursements against each matter, generate numbered invoices in naira, record payments as they land and see outstanding balances firm-wide. Subscriptions are paid in naira too.',
    },
    dataLaw:
      'Client information is sensitive. Each firm’s data in The Counsel is isolated at the database level, access is controlled by role, and every action is recorded in an audit log, which supports a firm’s own obligations under the Nigeria Data Protection Act.',
    faqs: [
      { q: 'Does The Counsel bill in naira?', a: 'Yes. Invoices, payments and reports are in naira, and subscriptions are paid in naira.' },
      { q: 'Can it track Federal High Court and State High Court dates?', a: 'Yes. Every hearing records the court, the business of the day, the assigned lawyer and the outcome, and sits on one firm calendar with reminders.' },
      { q: 'Can we bring in our existing matters and clients?', a: 'Yes. Our onboarding team helps firms migrate matters, clients and documents so you don’t start from a blank workspace.' },
      { q: 'Is there a free trial?', a: 'Yes, 30 days free on any plan, with no card required.' },
    ],
  },
  {
    slug: 'ghana',
    country: 'Ghana',
    seoTitle: 'Law Firm Software in Ghana: Practice Management for Ghanaian Law Firms | The Counsel',
    seoDescription:
      'Practice management software for law firms in Ghana. Matters, clients, court dates, documents, tasks and reports in one secure system. Free 30-day trial.',
    h1: 'Law firm software for Ghanaian law firms',
    intro:
      'The Counsel gives law firms in Ghana one secure place for matters, clients, court dates, documents, tasks and the team, replacing the spreadsheets, shared folders and group chats most practices still run on.',
    cities: 'Accra, Kumasi, Takoradi, Tamale and across Ghana',
    practice: {
      heading: 'One place for every matter and every court date',
      body: [
        'Each matter gets a number, a status, a lead lawyer and a full history, with its documents, notes and tasks attached. Every hearing sits on one shared firm calendar, and the team is reminded the day before by email and WhatsApp.',
        'Partners see workload across the firm, associates see exactly what is due, and everyone works from the same up-to-date record instead of asking around.',
      ],
    },
    courts: [
      'Supreme Court and Court of Appeal',
      'High Court, including its specialised divisions',
      'Circuit Courts',
      'District Courts',
      'Arbitration and other tribunals',
    ],
    billing: { heading: 'What works in Ghana today', body: NAIRA_ONLY('Ghanaian cedi') },
    dataLaw:
      'Each firm’s data in The Counsel is isolated at the database level, access is controlled by role, and every action is recorded in an audit log, which supports a firm’s own obligations under Ghana’s Data Protection Act.',
    faqs: [
      { q: 'Can firms in Ghana sign up?', a: 'Yes. Ghanaian firms can sign up today and use every module on a free 30-day trial.' },
      { q: 'Can I invoice clients in cedi?', a: 'Not yet. Invoices in The Counsel are in naira for now, with cedi on the way. Everything else, including matters, hearings and documents, works fully.' },
      { q: 'Can it track hearings in Ghanaian courts?', a: 'Yes. You record the court, business of the day, assigned lawyer and outcome for each hearing, on one firm calendar with reminders.' },
    ],
  },
  {
    slug: 'kenya',
    country: 'Kenya',
    seoTitle: 'Law Firm Software in Kenya: Practice Management for Kenyan Advocates | The Counsel',
    seoDescription:
      'Practice management software for law firms and advocates in Kenya. Matters, clients, court dates, documents, tasks and reports in one secure system. Free 30-day trial.',
    h1: 'Law firm software for Kenyan advocates',
    intro:
      'The Counsel gives advocates and law firms in Kenya one secure place for matters, clients, court dates, documents, tasks and the team, so the whole firm works from the same record.',
    cities: 'Nairobi, Mombasa, Kisumu, Nakuru, Eldoret and across Kenya',
    practice: {
      heading: 'Every matter, mention and deadline in one place',
      body: [
        'Each matter is numbered, given a status and a lead advocate, and keeps its documents, notes, tasks and full history together. Mentions, hearings and rulings sit on one shared calendar, with reminders to everyone on the matter the day before.',
        'Firms with more than one office can scope members and matters to a branch, while partners still see the whole practice.',
      ],
    },
    courts: [
      'Supreme Court and Court of Appeal',
      'High Court',
      'Employment and Labour Relations Court',
      'Environment and Land Court',
      'Magistrates’ Courts',
      'Tribunals and arbitration',
    ],
    billing: { heading: 'What works in Kenya today', body: NAIRA_ONLY('Kenyan shillings') },
    dataLaw:
      'Each firm’s data in The Counsel is isolated at the database level, access is controlled by role, and every action is recorded in an audit log, which supports a firm’s own obligations under Kenya’s Data Protection Act.',
    faqs: [
      { q: 'Can firms in Kenya sign up?', a: 'Yes. Kenyan firms can sign up today and use every module on a free 30-day trial.' },
      { q: 'Can I invoice clients in shillings?', a: 'Not yet. Invoices in The Counsel are in naira for now, with Kenyan shillings on the way. Everything else works fully.' },
      { q: 'Does it support firms with several offices?', a: 'Yes. Members, matters and reporting can be scoped to a branch, with firm-wide visibility for leadership.' },
    ],
  },
  {
    slug: 'south-africa',
    country: 'South Africa',
    seoTitle: 'Law Firm Software in South Africa: Practice Management for SA Law Firms | The Counsel',
    seoDescription:
      'Practice management software for law firms in South Africa. Matters, clients, court dates, documents, tasks and reports in one secure system. Free 30-day trial.',
    h1: 'Law firm software for South African law firms',
    intro:
      'The Counsel gives attorneys and law firms in South Africa one secure place for matters, clients, court dates, documents, tasks and the team, instead of spreadsheets, shared drives and email threads.',
    cities: 'Johannesburg, Cape Town, Durban, Pretoria and across South Africa',
    practice: {
      heading: 'One record for every matter and every court date',
      body: [
        'Each matter gets a number, a status, a responsible attorney and a full history, with documents, notes and tasks attached. Every court date sits on one shared firm calendar, with reminders to everyone on the matter.',
        'Role-based access means candidate attorneys, paralegals, finance and partners each see what they need, and nothing they shouldn’t.',
      ],
    },
    courts: [
      'Constitutional Court and Supreme Court of Appeal',
      'High Court divisions',
      'Labour Court and Labour Appeal Court',
      'Magistrates’ Courts',
      'Tribunals and arbitration',
    ],
    billing: { heading: 'What works in South Africa today', body: NAIRA_ONLY('South African rand') },
    dataLaw:
      'Each firm’s data in The Counsel is isolated at the database level, access is controlled by role, and every action is recorded in an audit log, which supports a firm’s own obligations under POPIA.',
    faqs: [
      { q: 'Can firms in South Africa sign up?', a: 'Yes. South African firms can sign up today and use every module on a free 30-day trial.' },
      { q: 'Can I invoice clients in rand?', a: 'Not yet. Invoices in The Counsel are in naira for now, with rand on the way. Everything else works fully.' },
      { q: 'Can different staff see different things?', a: 'Yes. Access is role-based, so a candidate attorney never sees firm-wide revenue, while partners see the whole practice.' },
    ],
  },
]

export const getCountry = (slug: string) => COUNTRIES.find((c) => c.slug === slug)!
