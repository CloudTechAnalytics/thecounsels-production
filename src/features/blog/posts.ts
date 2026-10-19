/**
 * Blog content lives in code on purpose: every article is a plain, reviewed,
 * versioned file change, ships with the site, and is fully crawlable. To
 * publish a new article, add an object to the TOP of POSTS and add its
 * /blog/<slug> line to public/sitemap.xml and public/robots.txt.
 */

export type PostBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }

export interface BlogPost {
  slug: string
  title: string
  /** One or two sentences, shown on cards and used as the meta description. */
  excerpt: string
  category: 'Practice management' | 'Litigation' | 'Billing' | 'Growing a firm'
  /** ISO date, YYYY-MM-DD. */
  date: string
  readMinutes: number
  body: PostBlock[]
}

export const POSTS: BlogPost[] = [
  {
    slug: 'never-miss-a-court-date',
    title: '4 habits that stop law firms missing court dates',
    excerpt:
      'A missed hearing costs a client’s trust and your reputation. These four habits close the gaps where dates usually get lost.',
    category: 'Litigation',
    date: '2026-10-19',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: 'Almost nobody misses a court date because they do not care. Dates are missed because they live in too many places at once: a diary, a WhatsApp chat, a junior’s notebook, someone’s memory. When those places disagree, a date quietly falls through.',
      },
      { type: 'h2', text: '1. Record the date before you leave the courtroom' },
      {
        type: 'p',
        text: 'The most dangerous moment is the walk out of court. The adjournment is fresh, everyone is moving, and the next date is only in your head. Make it a rule that the next date, the court and the judge are recorded before anyone leaves the building, not at the end of the day.',
      },
      { type: 'h2', text: '2. Put the date on the matter, not in a chat' },
      {
        type: 'p',
        text: 'A date in a group chat is buried by the next ten messages. A date attached to the matter itself is found by anyone who opens the file. Keep one source of truth, and let everything else (calendar, reminders, the weekly meeting) read from it.',
      },
      { type: 'h2', text: '3. Send reminders that reach people before the day, not after' },
      {
        type: 'p',
        text: 'A reminder only helps if it arrives where people already look, and early enough to act on. Use both email and WhatsApp, and remind the whole team on the matter, not only the lead lawyer who may be travelling.',
      },
      { type: 'h2', text: '4. Give every date one clear owner' },
      {
        type: 'p',
        text: 'When everyone is responsible, no one is. Name one person per hearing who prepares the bundle and confirms attendance, and one backup. The owner’s name should be visible next to the date.',
      },
      { type: 'h2', text: 'Make the habits automatic' },
      {
        type: 'p',
        text: 'Habits fail when they depend on someone remembering. The Counsel records hearings on the matter with the court, judge and date, shows them on a shared firm calendar, and sends reminders by email and WhatsApp, so the four habits above happen by default.',
      },
    ],
  },
  {
    slug: 'billing-terms-every-lawyer-should-know',
    title: 'Retainer, WIP, disbursement, write-off: four billing terms explained',
    excerpt:
      'Clear billing language prevents awkward conversations. Here is what each term means and why tracking them well protects your revenue.',
    category: 'Billing',
    date: '2026-10-19',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: 'Most billing disputes are really vocabulary disputes. The firm and the client use the same words to mean different things. Getting these four terms straight, internally and with clients, removes a lot of friction.',
      },
      { type: 'h2', text: 'Retainer' },
      {
        type: 'p',
        text: 'Money paid upfront to secure your services and to cover future work. It is not a fee for work already done. Record it separately and draw it down against invoices, so the client always knows what is left.',
      },
      { type: 'h2', text: 'WIP (work in progress)' },
      {
        type: 'p',
        text: 'Work that has been done but not yet invoiced. WIP is where revenue quietly leaks: time that was worked, never recorded, or recorded but never billed. Reviewing WIP every month is one of the fastest ways to recover money your firm has already earned.',
      },
      { type: 'h2', text: 'Disbursement' },
      {
        type: 'p',
        text: 'A cost you pay on the client’s behalf, such as court filing fees or certified copies. Disbursements should be recorded the day they are paid, with a receipt, and shown on the invoice as separate lines from your professional fees.',
      },
      { type: 'h2', text: 'Write-off' },
      {
        type: 'p',
        text: 'Time or fees you choose not to bill. Sometimes that is the right call for the relationship. The point is to make it a deliberate decision that is recorded, not a silent loss nobody notices until year end.',
      },
      {
        type: 'quote',
        text: 'If you can see earned, collected and owed on one screen, most billing problems solve themselves.',
      },
      {
        type: 'p',
        text: 'The Counsel tracks billable time, invoices, payments and unbilled work next to the matters themselves, so you can see what is earned, what is collected and what is still owed on any day of the month.',
      },
    ],
  },
  {
    slug: 'five-questions-every-managing-partner-should-answer',
    title: 'Five questions every managing partner should answer in seconds',
    excerpt:
      'If answering these takes a phone call, your firm is running on memory. A quick self-test for partners.',
    category: 'Practice management',
    date: '2026-10-19',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: 'A well-run firm can answer basic questions about itself quickly. Try these five. If any of them needs a phone call, a search through WhatsApp, or the words "let me check and get back to you", that is a gap worth closing.',
      },
      {
        type: 'ol',
        items: [
          'What is happening in court this week?',
          'Who has not paid us yet, and how much?',
          'What is overdue on this matter?',
          'Where is the signed document?',
          'Who is working on what?',
        ],
      },
      { type: 'h2', text: 'Why these five' },
      {
        type: 'p',
        text: 'They cover the four things that decide whether a firm is healthy: its calendar, its cash, its documents and its people. A firm that can answer all five instantly is rarely surprised by a missed date, a lost file or an unbilled month.',
      },
      { type: 'h2', text: 'How to close the gap' },
      {
        type: 'ul',
        items: [
          'Keep hearings and deadlines on the matter, visible on one shared calendar.',
          'Track time, invoices and payments in the same place as the matters.',
          'File every document against its matter the day it arrives.',
          'Assign every task to a named person with a due date.',
        ],
      },
      {
        type: 'p',
        text: 'The Counsel puts these answers on one dashboard, so a partner can open it on Monday morning and see the week without calling anyone.',
      },
    ],
  },
  {
    slug: 'opening-a-new-matter-checklist',
    title: 'Opening a new matter: the five things to capture on day one',
    excerpt:
      'Get these five details right at intake and everything after it, from tasks to billing to reporting, falls into place.',
    category: 'Practice management',
    date: '2026-10-19',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: 'The cost of a messy intake shows up months later: a missing instruction, an unclear lead lawyer, a deadline nobody knew about. A short, consistent checklist at the start prevents most of it.',
      },
      {
        type: 'ol',
        items: [
          'The client, and who actually gives instructions on their behalf.',
          'The practice area, so the right people and templates apply.',
          'The court and judge, if there is one.',
          'The lead counsel and the supporting team.',
          'Key dates: hearings, filing deadlines and limitation periods.',
        ],
      },
      { type: 'h2', text: 'Why day one matters' },
      {
        type: 'p',
        text: 'Every later step reads from these details. Tasks are assigned to the right people, invoices go to the right client contact, and the calendar shows the right dates. If they are wrong or missing at the start, you will be correcting them for the life of the matter.',
      },
      { type: 'h2', text: 'Make it the default' },
      {
        type: 'p',
        text: 'A checklist only works if it is hard to skip. In The Counsel, each new matter carries these fields built in, so nothing is forgotten and every matter starts from the same complete record.',
      },
    ],
  },
]

export function getPost(slug: string | undefined): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug)
}

export function formatPostDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
