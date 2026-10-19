/**
 * Blog content lives in code on purpose: every article is a plain, reviewed,
 * versioned file change, ships with the site, and is fully crawlable. To
 * publish a new article, add an object to the TOP of POSTS, add a cover at
 * public/blog/<slug>.webp, and add its /blog/<slug> line to
 * public/sitemap.xml and public/robots.txt.
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
    readMinutes: 7,
    body: [
      {
        type: 'p',
        text: 'Ask a partner whether the firm is busy and the answer is almost always yes. Ask whether the firm is collecting what it earns and the answer gets quieter. The distance between those two answers is where most law firm revenue goes missing, and it rarely goes missing in one dramatic moment. It leaks, a little at a time, at four predictable points.',
      },
      {
        type: 'p',
        text: 'Think of revenue as a pipeline. First the work is done. Then the time is recorded. Then an invoice is raised. Finally the payment is collected and matched to that invoice. A break at any step stops money reaching the bank, and because each step is usually owned by a different person, nobody sees the whole pipe.',
      },
      { type: 'h2', text: 'Leak one: work that is never recorded' },
      {
        type: 'p',
        text: 'The smallest pieces of work are the easiest to lose. A ten-minute call with a client, a quick review of a draft agreement, a trip to the registry to collect a certified copy. Each one feels too small to bother recording, yet across a lawyer’s week they add up to hours.',
      },
      {
        type: 'p',
        text: 'The cure is timing. Time recorded on the day is accurate and quick. Time reconstructed at month end from a diary and memory is slow, argued over and always lower than the truth. Ask every lawyer to log time at the end of each working day, against the matter, while the details are still fresh. Ten minutes a day is a far smaller cost than the hours that otherwise vanish.',
      },
      { type: 'h2', text: 'Leak two: recorded work that is never invoiced' },
      {
        type: 'p',
        text: 'Work in progress, usually shortened to WIP, is work that has been done and recorded but not yet invoiced. A little WIP is normal. A growing pile of it is a warning, because the longer billable work waits, the harder it is to bill. Clients forget the detail, the matter moves on, and the partner who would have signed off the invoice has lost the context.',
      },
      {
        type: 'p',
        text: 'Pick one fixed day each month and review everything that has been recorded but not billed, matter by matter. For each one make a clear decision: bill it, hold it for a good reason, or write it off on purpose. The point is not to bill everything. The point is that nothing is left in the pile because nobody looked.',
      },
      { type: 'h2', text: 'Leak three: invoices nobody follows up' },
      {
        type: 'p',
        text: 'An invoice that is sent and then forgotten is an interest-free loan to the client. Many firms feel awkward chasing payment and so they wait, and the longer they wait the more awkward it becomes. Collection is a routine, not a confrontation, and the firms that treat it that way are paid faster.',
      },
      {
        type: 'ul',
        items: [
          'Know on any day which invoices are overdue and by how many days.',
          'Name one person who owns follow-up, so it never depends on a partner remembering.',
          'Send a polite reminder the day an invoice becomes overdue, not a month later.',
          'Agree payment terms in the engagement letter, so a reminder is only an application of what was agreed.',
        ],
      },
      { type: 'h2', text: 'Leak four: payments that are not matched' },
      {
        type: 'p',
        text: 'Money arrives in the account and nobody is sure which invoice it settles. A partial payment is recorded loosely, a transfer is attributed to the wrong client, and weeks later a reminder goes to someone who already paid. This is embarrassing, and it also hides the true position on what is owed.',
      },
      {
        type: 'p',
        text: 'Record every payment against the invoice it settles the day it lands, including part-payments, so the status of each invoice is always honest: unpaid, partly paid or paid. When statuses are accurate, outstanding balances are a number you can read, not an estimate you have to chase.',
      },
      { type: 'h2', text: 'Three numbers worth watching every month' },
      {
        type: 'ol',
        items: [
          'Unbilled work: how much recorded time is still waiting to be invoiced.',
          'Overdue invoices: how much is owed past its due date, and for how long.',
          'Collection rate: of what you invoiced, how much did you actually collect.',
        ],
      },
      {
        type: 'quote',
        text: 'You cannot fix a leak you cannot see. Put earned, billed and collected side by side.',
      },
      { type: 'h2', text: 'Make the pipeline visible' },
      {
        type: 'p',
        text: 'Spreadsheets can hold these numbers, but they depend on someone updating them, and the person updating them is usually the busiest person in the firm. The more reliable approach is to record time, invoices and payments where the matter already lives, so the figures update as a by-product of the work.',
      },
      {
        type: 'p',
        text: 'The Counsel keeps time entries, invoices and payments next to the matter they belong to, sweeps unbilled work into a numbered draft invoice in seconds, flags overdue invoices, and reports revenue, collection rate and work in progress for partners. Each leak above becomes something you can see before it becomes a loss.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'Most partners dislike their own meetings. They start late, drift into stories, and end with a feeling that a lot was said and little was decided. The usual diagnosis is that people talk too much. The more accurate diagnosis is that the meeting is doing a job it should not have to do: collecting information.',
      },
      {
        type: 'p',
        text: 'When nobody can see, at a glance, who is in court, what is overdue and what is unpaid, the first half hour of the meeting becomes a round of verbal reports. Each partner describes their matters from memory, the others ask questions, and the facts are assembled live. Fix the information and the meeting shrinks on its own.',
      },
      { type: 'h2', text: 'Before the meeting: one screen, no preparation' },
      {
        type: 'p',
        text: 'The test of a good firm system is that a partner can open it five minutes before the meeting and know the state of the practice without calling anyone. Hearings for the week, tasks that slipped, invoices that are overdue and new matters opened should all be readable from one place. If preparing for the meeting means messaging three associates for figures, the system is doing too little.',
      },
      { type: 'h2', text: 'A twenty-minute agenda' },
      {
        type: 'ol',
        items: [
          'The week ahead (five minutes): hearings, filing deadlines and who is covering what.',
          'What slipped (four minutes): tasks and deadlines that are overdue, and why.',
          'Cash (four minutes): invoices overdue and payments received.',
          'New work (three minutes): matters opened and enquiries waiting for a response.',
          'One decision (four minutes): the single item that genuinely needs a partner.',
        ],
      },
      {
        type: 'p',
        text: 'Notice what is missing: updates on every matter. Matters that are on track do not need airtime. The meeting is for the exceptions, and the shared view tells you which matters those are.',
      },
      { type: 'h2', text: 'Rules that keep it short' },
      {
        type: 'ul',
        items: [
          'Start on time and finish on time, even if an item is unresolved. Unresolved items become tasks.',
          'Discuss exceptions only. If a matter is on track, it is skipped.',
          'Take long conversations offline: the meeting decides who will discuss them, not the outcome.',
          'Rotate who chairs, so the agenda belongs to the partnership and not to one person.',
        ],
      },
      { type: 'h2', text: 'Come with the numbers, not the stories' },
      {
        type: 'p',
        text: 'Stories are persuasive and unreliable. A partner who says a client is always slow to pay may be right, or may be remembering one bad month. Overdue invoices by client, in a table, settle the question in a few seconds. Keep opinions for the decision at the end of the agenda and let the numbers carry the rest.',
      },
      { type: 'h2', text: 'End with owners and dates' },
      {
        type: 'p',
        text: 'A meeting is only as good as what happens after it. Every item that leaves the room needs one named owner and one date. Put it straight onto the matter as a task before anyone stands up, so that next week’s meeting begins by reviewing what was actually done, not what people remember agreeing.',
      },
      {
        type: 'quote',
        text: 'If the meeting repeats the same discussion every week, the decision was never written down.',
      },
      { type: 'h2', text: 'What changes when the information is shared' },
      {
        type: 'p',
        text: 'Firms that move to a shared view of hearings, tasks and billing report the same shift: partners arrive already informed, meetings become decisions instead of briefings, and associates stop being interrupted for status updates. The partners’ time goes where it is worth most, which is judgement.',
      },
      {
        type: 'p',
        text: 'The Counsel puts hearings on a shared firm calendar, assigns tasks per matter with owners and due dates, flags overdue items, and gives partners a dashboard of the whole firm. It is the single screen to open the meeting with, so twenty minutes is enough.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'Every firm has had the moment. A client calls about the signed copy of an agreement. The partner needs it now. The only person who knows where it is, is in court, on leave, or has left the firm. Somebody starts searching through email, phone galleries and shared folders, and twenty minutes later the document turns up in a place nobody would have guessed.',
      },
      {
        type: 'p',
        text: 'That scramble is a symptom of documents depending on people instead of structure. A document should be findable by anyone with the right access, without asking the person who filed it. Four habits make that possible, and none of them requires special software to start.',
      },
      { type: 'h2', text: '1. File against the matter, the day it arrives' },
      {
        type: 'p',
        text: 'The most common reason a document is lost is that it never arrived anywhere permanent. It sat in an inbox, a messaging app or a phone gallery, waiting for someone to file it later. Later usually never comes.',
      },
      {
        type: 'p',
        text: 'Make filing part of receiving. When a document comes in, it is attached to its matter that day, and the loose copies are deleted. The matter becomes the single home for everything about the case: contracts, pleadings, correspondence, evidence and notes.',
      },
      { type: 'h2', text: '2. Name files so they explain themselves' },
      {
        type: 'p',
        text: 'A folder full of files called final, final2 and scan0043 is a folder nobody can use. Agree one naming pattern and use it everywhere. A reliable pattern puts the date first so files sort in order, then the document type, then the party: 2026-10-12 Sale Agreement Okafor.',
      },
      {
        type: 'ul',
        items: [
          'Put the date first, in year-month-day order, so lists sort naturally.',
          'State the document type in plain words: Sale Agreement, Statement of Claim, Letter.',
          'Add the other party or subject, never just the client’s own name.',
          'Avoid words like final or latest. Use a version number or a date instead.',
        ],
      },
      { type: 'h2', text: '3. Keep final versions apart from drafts' },
      {
        type: 'p',
        text: 'The worst document mistakes are not losses but mix-ups: the draft sent instead of the signed version, the old template filed as the current agreement. Separate what is final, signed or filed with the court from what is still being worked on, and make that separation visible in how files are categorised.',
      },
      {
        type: 'p',
        text: 'A simple category on every document is enough: agreement, pleading, correspondence, evidence, memo. Categories turn a long list into something a person can scan, and they make searching reliable even when file names are imperfect.',
      },
      { type: 'h2', text: '4. Control who can open what' },
      {
        type: 'p',
        text: 'Findable does not mean open to everyone. Client files contain confidential material, and some matters are restricted even within the firm. The goal is that the right people find documents quickly and the wrong people cannot open them at all.',
      },
      {
        type: 'p',
        text: 'Give access by role and by matter: a paralegal sees what the matter team needs, a managing partner sees across the firm, and nobody sees files for matters they have no reason to touch. Where possible, keep a record of who opened or downloaded a sensitive document. If a question about confidentiality is ever raised, that record is your answer.',
      },
      { type: 'h2', text: 'A simple test' },
      {
        type: 'p',
        text: 'Pick a matter at random and ask a junior who has never worked on it to find the signed engagement letter. If they can do it in under a minute without asking anyone, your document habits work. If they cannot, you have found the gap before a client did.',
      },
      {
        type: 'quote',
        text: 'A document that only one person can find belongs to that person, not to the firm.',
      },
      { type: 'h2', text: 'Let the system do the filing' },
      {
        type: 'p',
        text: 'The Counsel stores documents against each matter in private, access-controlled storage, with categories, a firm-wide search, and common file types such as PDFs and images viewable inside the app. Access follows role, so the right person finds the right file in seconds without a hunt through email.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'A partner stops an associate in the corridor and says, please prepare the bundle for Thursday. The associate nods. Both go back to their day. On Wednesday evening the partner asks where the bundle is, and the associate says they thought it was for the following week. Nobody was careless. The task simply never existed anywhere except in two people’s heads.',
      },
      {
        type: 'p',
        text: 'Most delegation failures in law firms have this shape. The work is understood slightly differently by the person who gave it and the person who received it, and there is nothing written down to settle the difference. Chasing is what partners do to compensate, and it is exhausting for everyone.',
      },
      { type: 'h2', text: 'What a good task contains' },
      {
        type: 'p',
        text: 'A task that can be delegated and forgotten safely carries four things. Without them, it is a request, and requests drift.',
      },
      {
        type: 'ul',
        items: [
          'One named owner. A task given to the team is a task given to nobody.',
          'A due date that someone chose, not a vague soon or as early as possible.',
          'A priority, so the urgent is clearly separated from the routine.',
          'A link to the matter it belongs to, so context is one click away.',
        ],
      },
      { type: 'h2', text: 'Write down what done looks like' },
      {
        type: 'p',
        text: 'Prepare the bundle can mean a dozen things. Does it include the authorities? Is it paginated? Is it printed or electronic? A single sentence describing the finished result removes most misunderstandings. If the person receiving the task cannot describe what finished looks like in their own words, the instruction has not landed yet.',
      },
      { type: 'h2', text: 'Make follow-up the system’s job' },
      {
        type: 'p',
        text: 'If following up depends on a partner remembering, it will fail in the busiest week, which is exactly when it matters. Overdue and due-soon tasks should surface on their own, in front of both the owner and the person who assigned them, so that nobody has to be the one who asks.',
      },
      {
        type: 'p',
        text: 'This changes the tone of delegation. Instead of a partner chasing an associate, the system shows a date approaching and the associate responds to the date. The relationship is no longer organised around reminders, and it frees partners to supervise quality instead of progress.',
      },
      { type: 'h2', text: 'Delegate with context, not just instructions' },
      {
        type: 'p',
        text: 'A task is easier to do well when the person can see the matter around it: the client, the hearing dates, the documents already filed, the notes from earlier steps. Keeping the task attached to the matter means the associate does not have to ask where to find things, and a colleague can pick the work up if the owner is unavailable.',
      },
      { type: 'h2', text: 'Review, do not nag' },
      {
        type: 'p',
        text: 'Use the weekly meeting to look at what slipped and why, instead of reminding people individually. Often a deadline was unrealistic, a person was overloaded, or the instruction was unclear. Those are worth fixing once, in the open, instead of being rediscovered every week through chasing.',
      },
      {
        type: 'ol',
        items: [
          'Give the task to one person, with a date and a priority.',
          'State in a sentence what done looks like.',
          'Attach it to the matter, so the context travels with it.',
          'Let overdue items surface automatically.',
          'Review what slipped in the weekly meeting and fix the cause.',
        ],
      },
      {
        type: 'quote',
        text: 'Good delegation is not trusting people more. It is giving them less to guess.',
      },
      { type: 'h2', text: 'Where the tooling helps' },
      {
        type: 'p',
        text: 'In The Counsel, tasks carry an owner, a due date and a priority and link to their matter. Everyone sees what is open and what is late without asking, overdue work is flagged, and a partner can review the whole team’s workload in one view before deciding who has capacity.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'Few things damage a litigation practice faster than a missed court date. A hearing that goes ahead without counsel, a matter struck out, an adjournment that costs the client money: each one is a conversation no lawyer wants to have. And almost every one of them is avoidable.',
      },
      {
        type: 'p',
        text: 'Almost nobody misses a date because they do not care. Dates are missed because they live in too many places at once: a diary, a messaging group, a junior’s notebook, someone’s memory. When those places disagree, a date quietly falls through the gap between them. The four habits below close those gaps.',
      },
      { type: 'h2', text: '1. Record the date before you leave the courtroom' },
      {
        type: 'p',
        text: 'The most dangerous moment is the walk out of court. The adjournment is fresh, everyone is moving, and the next date is held only in your head. By the time you reach the office there have been three other calls, and the date is now a half-memory.',
      },
      {
        type: 'p',
        text: 'Make it a rule that the next date, the court and the judge are recorded before anyone leaves the building, from a phone if necessary. A date recorded at the courtroom door is far more reliable than one reconstructed at the end of the day.',
      },
      { type: 'h2', text: '2. Put the date on the matter, not in a chat' },
      {
        type: 'p',
        text: 'A date in a group chat is buried by the next ten messages. A date attached to the matter itself is found by anyone who opens the file. Keep one source of truth for every hearing, and let everything else, such as the calendar, reminders and the weekly meeting, read from it.',
      },
      {
        type: 'ul',
        items: [
          'Record the hearing type: mention, hearing, ruling or judgment.',
          'Record the court, the judge and the courtroom where they are known.',
          'Record the outcome afterwards, so the history of the matter is complete.',
          'Never keep a second private copy of a date. Two copies will eventually disagree.',
        ],
      },
      { type: 'h2', text: '3. Send reminders that arrive before the day, not after' },
      {
        type: 'p',
        text: 'A reminder only helps if it reaches people where they already look and early enough to act. A reminder at nine on the morning of a hearing is a notification of a problem, not a prevention of one. Preparing a bundle, briefing a colleague and arranging travel all need days, not hours.',
      },
      {
        type: 'p',
        text: 'Use more than one channel. Email is reliable for a record, and a messaging app is where people actually look during a busy day. Remind the whole team on the matter, not only the lead lawyer, who may be travelling or already in another court.',
      },
      { type: 'h2', text: '4. Give every date one clear owner' },
      {
        type: 'p',
        text: 'When everyone is responsible, no one is. Each hearing needs a named person who prepares the bundle and confirms attendance, and a named backup who steps in if something changes. The owner’s name should be visible beside the date, where the whole team can see it.',
      },
      {
        type: 'p',
        text: 'This is also what makes cover possible. If the lead lawyer is delayed, the backup already knows the matter is theirs, instead of discovering it from a phone call from the registry.',
      },
      { type: 'h2', text: 'A weekly check that catches what slips' },
      {
        type: 'p',
        text: 'Once a week, ideally on Friday afternoon, read through every hearing in the following two weeks with the whole litigation team. Confirm each has an owner, a backup and the papers in hand. Ten minutes of this check catches the date that was recorded wrongly, the hearing nobody was assigned to, and the clash between two courts.',
      },
      {
        type: 'quote',
        text: 'A system that depends on remembering will fail on the busiest day. Build the habit into the process.',
      },
      { type: 'h2', text: 'Make the habits automatic' },
      {
        type: 'p',
        text: 'Habits fail when they depend on someone remembering. The Counsel records hearings on the matter with the court, judge, type and outcome, shows them on a shared firm calendar, lets you assign lawyers to each hearing, and sends reminders by email and WhatsApp, so the four habits above happen by default.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'Most billing disputes are really vocabulary disputes. The firm and the client use the same words to mean different things, or the firm’s own people use them inconsistently. A client who believes a retainer is a fixed total price, or that disbursements are included in fees, will be unhappy when the invoice arrives, even if the invoice is perfectly correct.',
      },
      {
        type: 'p',
        text: 'Getting four terms straight, internally and with clients, removes a great deal of friction. They are retainer, work in progress, disbursement and write-off. Each describes a different point in the life of a fee, and each is worth tracking separately.',
      },
      { type: 'h2', text: 'Retainer' },
      {
        type: 'p',
        text: 'A retainer is money paid upfront to secure your services and to cover future work. It is not a fee for work already done, and it is not a fixed price for the matter. It is an advance, held against which work is billed.',
      },
      {
        type: 'p',
        text: 'Record it separately and draw it down against invoices, so the client always knows how much of it remains. When the balance runs low, a top-up request should follow naturally rather than as a surprise. Say in the engagement letter exactly how the retainer is used and what happens to any unused balance.',
      },
      { type: 'h2', text: 'WIP (work in progress)' },
      {
        type: 'p',
        text: 'Work in progress is work that has been done and recorded but not yet invoiced. It is the quietest place for revenue to leak. Time was worked, a cost was incurred, and then the invoice was delayed by a busy week, a missing approval or simple forgetfulness.',
      },
      {
        type: 'p',
        text: 'Review WIP at least monthly, by matter and by client. Old WIP is the warning sign: the older it is, the harder it becomes to bill, because the client has forgotten the detail and the work no longer feels fresh. Reviewing it regularly is one of the fastest ways to recover money your firm has already earned.',
      },
      { type: 'h2', text: 'Disbursement' },
      {
        type: 'p',
        text: 'A disbursement is a cost you pay on the client’s behalf: court filing fees, certified copies, search fees, courier charges, travel to a registry. It is not part of your professional fee and should never be hidden inside it.',
      },
      {
        type: 'ul',
        items: [
          'Record each disbursement the day it is paid, with its receipt.',
          'Show disbursements as separate lines on the invoice, apart from professional fees.',
          'Agree with the client in advance when a large cost will need funds upfront.',
          'Never let small disbursements accumulate unrecorded; they are the easiest cost to lose.',
        ],
      },
      { type: 'h2', text: 'Write-off' },
      {
        type: 'p',
        text: 'A write-off is time or fees you choose not to bill. Sometimes it is the right decision: a goodwill gesture to a long-standing client, a task that took longer than it should have, a dispute not worth escalating. The problem is never the write-off itself. The problem is the silent write-off, where time simply never gets billed and nobody decides anything.',
      },
      {
        type: 'p',
        text: 'Make it a deliberate decision by a named person, with a reason recorded. Over a year, the pattern of write-offs tells you something valuable: which kinds of matters are underpriced, which clients routinely get extra work for free, and which lawyers consistently record more than the firm can bill.',
      },
      { type: 'h2', text: 'How the four fit together' },
      {
        type: 'ol',
        items: [
          'The client pays a retainer, which is held against future work.',
          'The lawyers record time and costs as work happens; unbilled items build up as WIP.',
          'At billing time, WIP and disbursements are swept into an invoice, drawn against the retainer where it applies.',
          'Anything the firm decides not to charge is written off deliberately and recorded.',
        ],
      },
      {
        type: 'quote',
        text: 'If you can see earned, collected and owed on one screen, most billing problems solve themselves.',
      },
      { type: 'h2', text: 'Track them where the matter lives' },
      {
        type: 'p',
        text: 'The Counsel tracks billable time, expenses, invoices, payments and unbilled work next to the matters themselves. Unbilled work sweeps into a numbered invoice in seconds, payments update each invoice’s status automatically, and reports show what is earned, what is collected and what is still owed on any day of the month.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'A well-run firm can answer basic questions about itself quickly. Not approximately, and not after a round of messages, but in the time it takes to look at a screen. This is a useful test because it measures the thing that matters: whether the firm’s knowledge lives in a system or in individual heads.',
      },
      {
        type: 'p',
        text: 'Try the five questions below. If any of them needs a phone call, a search through a messaging group, or the words let me check and get back to you, that is a gap worth closing. Most firms find at least two.',
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
      { type: 'h2', text: '1. What is happening in court this week?' },
      {
        type: 'p',
        text: 'This is the calendar question. A partner should be able to list every hearing in the coming days, with the court, the judge and who is attending. If the answer lives in several diaries, the risk is not just inconvenience: it is a missed date. A single firm calendar, fed from the matters themselves, is the fix.',
      },
      { type: 'h2', text: '2. Who has not paid us yet, and how much?' },
      {
        type: 'p',
        text: 'This is the cash question. The answer should be a list of outstanding invoices with amounts and ages, ready on demand. Firms that cannot answer it quickly often discover that a large share of their annual revenue is sitting unpaid because nobody had the full picture.',
      },
      { type: 'h2', text: '3. What is overdue on this matter?' },
      {
        type: 'p',
        text: 'This is the control question. For any matter, a partner should see open tasks, missed deadlines and the next scheduled step without interrogating the lawyer in charge. Overdue items that surface automatically turn supervision from interrogation into a quick glance.',
      },
      { type: 'h2', text: '4. Where is the signed document?' },
      {
        type: 'p',
        text: 'This is the records question. Documents should be attached to the matter they belong to, categorised and searchable, so the signed copy is found in seconds and not recovered from someone’s email. It is a question clients ask at the worst moments, and the answer reflects on the whole firm.',
      },
      { type: 'h2', text: '5. Who is working on what?' },
      {
        type: 'p',
        text: 'This is the capacity question. Before accepting new work or assigning cover, a partner needs to know who has room and who is stretched. Without a view of workload by person, decisions are made on impressions, and the quiet lawyer who is quietly overloaded is the one who burns out.',
      },
      { type: 'h2', text: 'Why these five' },
      {
        type: 'p',
        text: 'They cover the four things that decide whether a firm is healthy: its calendar, its cash, its documents and its people. A firm that can answer all five instantly is rarely surprised by a missed date, a lost file or an unbilled month. A firm that cannot is relying on individuals to hold the whole practice in their heads.',
      },
      { type: 'h2', text: 'How to close the gap' },
      {
        type: 'ul',
        items: [
          'Keep hearings and deadlines on the matter, visible on one shared calendar.',
          'Track time, invoices and payments in the same place as the matters.',
          'File every document against its matter the day it arrives.',
          'Assign every task to a named person with a due date.',
          'Review a firm-wide dashboard at the start of every week.',
        ],
      },
      {
        type: 'quote',
        text: 'The measure of a firm’s system is not what it can store. It is how fast it can answer.',
      },
      { type: 'h2', text: 'One place to answer all five' },
      {
        type: 'p',
        text: 'The Counsel puts these answers on one dashboard: upcoming hearings, outstanding invoices, overdue tasks, matter documents and workload by person. A partner can open it on Monday morning and see the week without calling anyone.',
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
    readMinutes: 6,
    body: [
      {
        type: 'p',
        text: 'The cost of a messy intake shows up months later. A missing instruction. An unclear lead lawyer. A deadline nobody knew about. An invoice sent to the wrong person. None of these felt important on the day the matter was opened, which is exactly why they were skipped.',
      },
      {
        type: 'p',
        text: 'A short, consistent checklist at the start prevents most of this. The aim is not paperwork for its own sake. It is making sure that every later step, from assigning work to billing the client, has accurate information to draw on. Here are the five things to capture on day one.',
      },
      { type: 'h2', text: '1. The client, and who actually gives instructions' },
      {
        type: 'p',
        text: 'Record the client properly, whether an individual or a company, with full contact details. For companies, go one step further and record who is authorised to give instructions and who receives invoices; they are often different people. Confusion here causes both professional risk and billing delays.',
      },
      { type: 'h2', text: '2. The practice area' },
      {
        type: 'p',
        text: 'Classify the matter by type: litigation, corporate, property, family, employment and so on. The practice area determines which lawyers should be involved, which templates and checklists apply, and how the matter appears in reports. It is also the foundation for understanding which parts of the firm are most profitable.',
      },
      { type: 'h2', text: '3. The court and the judge, if there is one' },
      {
        type: 'p',
        text: 'For contentious matters, note the court, the suit number and the judge as soon as they are known. These details feed straight into hearing records and the firm calendar, and they are painful to reconstruct later from letters and filed documents.',
      },
      { type: 'h2', text: '4. The lead counsel and the supporting team' },
      {
        type: 'p',
        text: 'Name the responsible partner, the lead lawyer and everyone else who will work on the matter, with their roles. This is who gets reminders, who sees the documents, and who is accountable. A matter with no clearly named lead is a matter that will drift.',
      },
      { type: 'h2', text: '5. Key dates: hearings, filing deadlines and limitation periods' },
      {
        type: 'p',
        text: 'Capture every date that has a consequence if missed. Limitation periods deserve special care, because missing one can end a claim for good. Put them on the matter with a reminder well ahead of the deadline, not just on the day.',
      },
      {
        type: 'ol',
        items: [
          'The client, and who gives instructions for them.',
          'The practice area, so the right people and templates apply.',
          'The court and judge, where relevant.',
          'The lead counsel and supporting team.',
          'Key dates: hearings, filing deadlines and limitation periods.',
        ],
      },
      { type: 'h2', text: 'What to add straight after the five' },
      {
        type: 'ul',
        items: [
          'The engagement letter and terms of billing, filed against the matter.',
          'A conflict check, recorded as done and by whom.',
          'The first tasks, each with an owner and a date.',
          'Any retainer received, recorded separately from fees.',
        ],
      },
      { type: 'h2', text: 'Why day one matters' },
      {
        type: 'p',
        text: 'Every later step reads from these details. Tasks are assigned to the right people. Invoices go to the right client contact. The calendar shows the right dates. Reports sort the matter into the right category. If the details are wrong or missing at the start, you will be correcting them for the life of the matter, usually under pressure.',
      },
      {
        type: 'quote',
        text: 'A matter opened well runs itself. A matter opened carelessly needs rescuing.',
      },
      { type: 'h2', text: 'Make it the default' },
      {
        type: 'p',
        text: 'A checklist only works if it is hard to skip. In The Counsel, each new matter carries these fields built in: it is numbered automatically, given a status, and assigned a lead lawyer and responsible partner from the start. Nothing is forgotten, and every matter begins from the same complete record.',
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
