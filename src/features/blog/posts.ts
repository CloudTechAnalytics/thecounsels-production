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
  /** Cover image under /public/blog (1200x675). */
  cover: string
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
    slug: 'from-work-done-to-money-collected',
    cover: '/blog/from-work-done-to-money-collected.webp',
    title: 'From work done to money collected: where law firm revenue leaks',
    excerpt:
      'Most firms do not lose money on the work. They lose it in the gaps between doing it, recording it, invoicing it and collecting it.',
    category: 'Growing a firm',
    date: '2026-10-19',
    readMinutes: 4,
    body: [
      {
        type: 'p',
        text: 'Think of revenue as a pipeline with four steps: the work is done, the time is recorded, the invoice is sent and the payment is collected. A firm can be busy and still short of cash because it leaks at one of those steps.',
      },
      { type: 'h2', text: 'Leak one: work that is never recorded' },
      {
        type: 'p',
        text: 'A quick call, a review of a draft, a trip to the registry. If it is not logged the day it happens, it is rarely logged at all. Ask lawyers to record time at the end of each day, against the matter, while it is fresh.',
      },
      { type: 'h2', text: 'Leak two: recorded work that is never invoiced' },
      {
        type: 'p',
        text: 'Unbilled time quietly piles up behind busy weeks. Pick a fixed day each month to review everything recorded but not yet invoiced, matter by matter, and decide what is billed, held or written off.',
      },
      { type: 'h2', text: 'Leak three: invoices nobody follows up' },
      {
        type: 'p',
        text: 'An invoice that is sent and forgotten is a loan. Know which invoices are overdue and by how long, and make one named person responsible for the follow-up call.',
      },
      {
        type: 'ul',
        items: [
          'Log time daily, not monthly.',
          'Review unbilled work on a fixed date each month.',
          'Check overdue invoices every week.',
          'Keep a record of every payment against its invoice.',
        ],
      },
      {
        type: 'quote',
        text: 'You cannot fix a leak you cannot see. Put earned, billed and collected side by side.',
      },
      {
        type: 'p',
        text: 'The Counsel keeps time entries, invoices and payments next to the matter they belong to, and its reports show revenue, collection rate and work in progress, so each of these leaks is visible before it becomes a loss.',
      },
    ],
  },
  {
    slug: 'the-twenty-minute-partner-meeting',
    cover: '/blog/the-twenty-minute-partner-meeting.webp',
    title: 'A weekly partner meeting that takes twenty minutes',
    excerpt:
      'Long meetings usually mean the numbers live in people’s heads. A shared view of the week makes a short meeting possible.',
    category: 'Growing a firm',
    date: '2026-10-19',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: 'Partner meetings run long when the first half hour is spent collecting information that should already be on the table: who is in court, what is overdue, what is unpaid. Fix that and the meeting shrinks.',
      },
      { type: 'h2', text: 'A simple agenda' },
      {
        type: 'ol',
        items: [
          'The week ahead: hearings, filing deadlines and who is covering what.',
          'What slipped: tasks and deadlines that are overdue.',
          'Cash: invoices overdue and payments received.',
          'New work: matters opened and enquiries waiting.',
          'One decision that needs a partner.',
        ],
      },
      { type: 'h2', text: 'Come with the numbers, not the stories' },
      {
        type: 'p',
        text: 'Everything above should be readable from one screen before the meeting starts. If a partner has to ask an associate for the figures, the system is the problem, not the people.',
      },
      { type: 'h2', text: 'End with owners and dates' },
      {
        type: 'p',
        text: 'Every item that leaves the room needs a name and a date next to it. Put them straight onto the matter as tasks, so next week’s meeting starts from what was actually done.',
      },
      {
        type: 'p',
        text: 'With hearings on a shared calendar, tasks assigned per matter and a dashboard for the whole firm, The Counsel gives partners that single screen to open the meeting with.',
      },
    ],
  },
  {
    slug: 'organise-legal-documents-so-anyone-can-find-them',
    cover: '/blog/organise-legal-documents-so-anyone-can-find-them.webp',
    title: 'Organising legal documents so anyone on the team can find them',
    excerpt:
      'A signed agreement that only one person can locate is a risk. Four habits that make every document easy to find.',
    category: 'Practice management',
    date: '2026-10-19',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: 'Every firm has had the moment: the client calls, the partner needs the signed copy, and the one person who knows where it is is in court. Good document habits remove that dependency on any one person.',
      },
      { type: 'h2', text: '1. File against the matter, the day it arrives' },
      {
        type: 'p',
        text: 'A document that waits in an inbox or a phone gallery is already half lost. Attach it to its matter as soon as it arrives, and delete the loose copies.',
      },
      { type: 'h2', text: '2. Name files so they explain themselves' },
      {
        type: 'p',
        text: 'Agree one pattern, for example date, document type and party: 2026-10-12 Sale Agreement Okafor. A stranger should be able to tell what a file is without opening it.',
      },
      { type: 'h2', text: '3. Separate final from draft' },
      {
        type: 'p',
        text: 'Keep signed and filed versions clearly apart from working drafts, so nobody sends the wrong version to a client or to court.',
      },
      { type: 'h2', text: '4. Control who can open what' },
      {
        type: 'p',
        text: 'Not every document is for every eye. Limit sensitive files to the people on the matter, and keep a record of who opened them.',
      },
      {
        type: 'p',
        text: 'The Counsel stores documents against each matter in private, role-controlled storage, with common file types viewable in the app, so the right person finds the right file in seconds.',
      },
    ],
  },
  {
    slug: 'delegate-tasks-without-chasing',
    cover: '/blog/delegate-tasks-without-chasing.webp',
    title: 'How to delegate in a law firm without chasing people',
    excerpt:
      'Delegation fails when the task lives in a conversation. Put it on the matter with an owner, a date and a priority.',
    category: 'Practice management',
    date: '2026-10-19',
    readMinutes: 3,
    body: [
      {
        type: 'p',
        text: 'A partner says “please prepare the bundle” in the corridor. A week later nobody remembers who agreed to what. The task was never written down anywhere that anyone else could see.',
      },
      { type: 'h2', text: 'What a good task contains' },
      {
        type: 'ul',
        items: [
          'One named owner, not a group.',
          'A due date that someone chose.',
          'A priority, so the urgent is separated from the routine.',
          'A link to the matter it belongs to.',
        ],
      },
      { type: 'h2', text: 'Make follow-up the system’s job' },
      {
        type: 'p',
        text: 'If following up depends on a partner remembering, it will stop on the busiest week. Overdue items should surface on their own, so the conversation can be about the work rather than about whether it was done.',
      },
      { type: 'h2', text: 'Review, do not nag' },
      {
        type: 'p',
        text: 'Use the weekly meeting to look at what slipped and why. Often a deadline was unrealistic or the instruction was unclear, and that is worth fixing once instead of chasing every time.',
      },
      {
        type: 'p',
        text: 'In The Counsel, tasks carry an owner, due date and priority and link to their matter, so the whole team sees what is open and what is late without anyone asking.',
      },
    ],
  },
  {
    slug: 'never-miss-a-court-date',
    cover: '/blog/never-miss-a-court-date.webp',
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
    cover: '/blog/billing-terms-every-lawyer-should-know.webp',
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
    cover: '/blog/five-questions-every-managing-partner-should-answer.webp',
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
    cover: '/blog/opening-a-new-matter-checklist.webp',
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
