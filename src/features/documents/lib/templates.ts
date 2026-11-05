import { format } from 'date-fns'
import { esc } from '@/shared/lib/print-document'

/**
 * Document templates: plain text with light formatting and {{placeholders}}.
 *   # Heading          **bold**   *italic*
 *   - bullet           1. numbered
 *   ---                (a rule)
 *   {{signature}}      the signer's saved e-signature
 * Placeholders the app can't fill (or any made-up {{like_this}}) become
 * questions on the "Use template" page.
 */

export const TEMPLATE_CATEGORIES = ['Engagement', 'Correspondence', 'Litigation', 'Property', 'Corporate', 'Other'] as const

export const PLACEHOLDERS: { key: string; label: string; group: string }[] = [
  { key: 'today', label: "Today's date", group: 'General' },
  { key: 'client.name', label: 'Client name', group: 'Client' },
  { key: 'client.address', label: 'Client address', group: 'Client' },
  { key: 'client.city', label: 'Client city', group: 'Client' },
  { key: 'client.email', label: 'Client email', group: 'Client' },
  { key: 'client.phone', label: 'Client phone', group: 'Client' },
  { key: 'matter.title', label: 'Matter title', group: 'Matter' },
  { key: 'matter.number', label: 'Matter number', group: 'Matter' },
  { key: 'matter.case_number', label: 'Suit / case number', group: 'Matter' },
  { key: 'matter.court', label: 'Court', group: 'Matter' },
  { key: 'matter.judge', label: 'Judge', group: 'Matter' },
  { key: 'matter.opposing_counsel', label: 'Opposing counsel', group: 'Matter' },
  { key: 'matter.practice_area', label: 'Practice area', group: 'Matter' },
  { key: 'firm.name', label: 'Firm name', group: 'Firm' },
  { key: 'firm.phone', label: 'Firm phone', group: 'Firm' },
  { key: 'firm.email', label: 'Firm email', group: 'Firm' },
  { key: 'firm.website', label: 'Firm website', group: 'Firm' },
  { key: 'me.name', label: 'Your name', group: 'Signer' },
  { key: 'me.title', label: 'Your title', group: 'Signer' },
  { key: 'me.email', label: 'Your email', group: 'Signer' },
  { key: 'signature', label: 'Your signature', group: 'Signer' },
]

export const placeholderKeys = (body: string): string[] =>
  [...new Set([...body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]))]

export const prettyField = (key: string) => {
  const known = PLACEHOLDERS.find((p) => p.key === key)
  if (known) return known.label
  const s = key.replace(/[._]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface TemplateContext {
  firm: { name: string; legal_name?: string | null; phone?: string | null; billing_email?: string | null; website?: string | null }
  client?: { display_name: string; address?: string | null; city?: string | null; email?: string | null; phone?: string | null } | null
  matter?: { title: string; matter_number?: string | null; case_number?: string | null; court?: string | null; judge?: string | null; opposing_counsel?: string | null; practice_area?: string | null } | null
  me: { name: string | null; title?: string | null; email?: string | null }
}

export function contextValues(c: TemplateContext): Record<string, string> {
  const v: Record<string, string | null | undefined> = {
    today: format(new Date(), 'd MMMM yyyy'),
    'client.name': c.client?.display_name,
    'client.address': c.client?.address,
    'client.city': c.client?.city,
    'client.email': c.client?.email,
    'client.phone': c.client?.phone,
    'matter.title': c.matter?.title,
    'matter.number': c.matter?.matter_number,
    'matter.case_number': c.matter?.case_number,
    'matter.court': c.matter?.court,
    'matter.judge': c.matter?.judge,
    'matter.opposing_counsel': c.matter?.opposing_counsel,
    'matter.practice_area': c.matter?.practice_area,
    'firm.name': c.firm.legal_name || c.firm.name,
    'firm.phone': c.firm.phone,
    'firm.email': c.firm.billing_email,
    'firm.website': c.firm.website,
    'me.name': c.me.name,
    'me.title': c.me.title,
    'me.email': c.me.email,
  }
  return Object.fromEntries(Object.entries(v).filter(([, x]) => x != null && String(x).trim() !== '').map(([k, x]) => [k, String(x)]))
}

function inline(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
    // __underline__ only around words — runs of underscores are blank lines to sign on.
    .replace(/(^|[^_])__([^_\s][^_]*?)__(?!_)/g, '$1<u>$2</u>')
}

/** Body → HTML. `values` fills placeholders; anything unfilled is shown as a
 * highlighted gap (preview) or left blank (final). */
export function renderTemplate(body: string, values: Record<string, string>, opts: { signature?: string | null; preview?: boolean } = {}): string {
  const SIG = '\u0000SIG\u0000'
  const filled = body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    if (key === 'signature') return SIG
    const v = values[key]
    if (v != null && v !== '') return v.replace(/[*_#]/g, (c) => `\u0001${c}`)
    return opts.preview ? `\u0002${prettyField(key)}\u0003` : '__________'
  })
  const lines = filled.replace(/\r/g, '').split('\n')
  const out: string[] = []
  let para: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = [] }
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null }
  for (const line of lines) {
    const t = line.trim()
    let m: RegExpMatchArray | null
    if (!t) { flushPara(); flushList(); continue }
    if (t === SIG) {
      flushPara(); flushList()
      out.push(opts.signature ? `<div class="tpl-sig"><img src="${esc(opts.signature)}" alt="Signature"></div>` : `<div class="tpl-sig tpl-sig-empty">${opts.preview ? 'Your signature (add it in Settings)' : ''}</div>`)
      continue
    }
    if (/^-{3,}$/.test(t)) { flushPara(); flushList(); out.push('<hr>'); continue }
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue }
    if ((m = t.match(/^[-•]\s+(.*)$/))) { flushPara(); if (list?.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] } } list!.items.push(m[1]); continue }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { flushPara(); if (list?.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] } } list!.items.push(m[1]); continue }
    flushList()
    para.push(t.includes(SIG) ? t.replace(SIG, '') : t)
  }
  flushPara(); flushList()
  return out.join('\n')
    .replace(/\u0001/g, '')
    .replace(/\u0002(.*?)\u0003/g, '<mark class="tpl-gap">$1</mark>')
}

export const LETTER_CSS = `
  .letter{font-size:13px;line-height:1.65;color:#1c1917}
  .letter p{margin:0 0 10px}
  .letter h1{font-family:'Playfair Display',Georgia,serif;font-size:17px;text-align:center;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 12px}
  .letter h2{font-size:14px;margin:14px 0 6px}
  .letter h3{font-size:13px;margin:12px 0 4px}
  .letter ul,.letter ol{margin:0 0 10px;padding-left:22px}
  .letter li{margin:3px 0}
  .letter hr{border:none;border-top:1px solid #e7e5e4;margin:14px 0}
  .letter .tpl-sig{height:58px;display:flex;align-items:flex-end;margin-top:6px}
  .letter .tpl-sig img{max-height:56px;max-width:240px}
  .letter .tpl-sig-empty{color:#a8a29e;font-size:11px;font-style:italic}
  .letter mark.tpl-gap{background:#FEF3C7;color:#92400E;border-radius:3px;padding:0 3px}
`

/** A Word-compatible .doc (HTML Word opens and saves natively). */
export function wordDocument(title: string, firm: TemplateContext['firm'], html: string): Blob {
  const contacts = [firm.phone, firm.billing_email, firm.website].filter(Boolean).map((x) => esc(x!)).join(' · ')
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page WordSection1{size:595.3pt 841.9pt;margin:60pt 60pt 60pt 60pt}
  div.WordSection1{page:WordSection1}
  body{font-family:Calibri,Arial,sans-serif;font-size:11.5pt;color:#1c1917}
  .firm{font-family:Georgia,serif;font-size:16pt;font-weight:bold;color:#1c1917}
  .contacts{font-size:9pt;color:#78716c;border-bottom:2pt solid #B38A3E;padding-bottom:6pt;margin-bottom:14pt}
  h1{font-family:Georgia,serif;font-size:13pt;text-align:center;text-transform:uppercase}
  p{margin:0 0 8pt;line-height:1.5}
  .tpl-sig{height:40pt}
</style></head>
<body><div class="WordSection1">
  <p class="firm">${esc(firm.legal_name || firm.name)}</p>
  ${contacts ? `<p class="contacts">${contacts}</p>` : ''}
  ${html.replace(/<div class="tpl-sig[^"]*">[\s\S]*?<\/div>/g, '<p class="tpl-sig">&nbsp;</p>')}
</div></body></html>`
  return new Blob(['﻿', doc], { type: 'application/msword' })
}

export const STARTER_TEMPLATES: { name: string; category: string; description: string; body: string }[] = [
  {
    name: 'Letter of Engagement',
    category: 'Engagement',
    description: 'Confirms instructions, scope of work, fees and terms.',
    body: `{{today}}

**{{client.name}}**
{{client.address}}

Dear Sir/Madam,

# Letter of Engagement — {{matter.title}}

Thank you for instructing {{firm.name}} in the above matter. This letter sets out the terms on which we will act for you.

## 1. Scope of our work
{{scope_of_work}}

## 2. Our fees
Our professional fee for this engagement is **{{professional_fee}}**, payable as follows: {{payment_terms}}. Out-of-pocket expenses such as filing fees, transport and service of processes will be billed separately at cost, supported by receipts.

## 3. Responsible lawyer
{{me.name}} will have day-to-day conduct of this matter, under the supervision of the firm's partners.

## 4. Your responsibilities
- Give us complete and accurate instructions and documents promptly.
- Tell us immediately of any change affecting the matter.
- Settle our invoices within 14 days of receipt.

## 5. Confidentiality
All information you give us will be kept confidential, subject to our duties under the law and the Rules of Professional Conduct for Legal Practitioners.

## 6. Termination
Either party may end this engagement by written notice. Fees for work done up to that date remain payable.

Kindly sign and return a copy of this letter to confirm your acceptance of these terms.

Yours faithfully,

{{signature}}
**{{me.name}}**
{{me.title}}
For: {{firm.name}}

---

**ACCEPTANCE**
I/We have read and accept the terms of this letter.

Name: ______________________   Signature: ______________________   Date: ____________`,
  },
  {
    name: 'Letter of Demand',
    category: 'Litigation',
    description: 'Pre-action demand for payment of a debt, with a deadline.',
    body: `{{today}}

**{{recipient_name}}**
{{recipient_address}}

Dear Sir/Madam,

# Demand for Payment of {{amount_owed}}

We act as solicitors to **{{client.name}}** ("our client"), on whose instructions we write.

Our client informs us that {{facts_of_the_debt}}.

Despite repeated demands, the sum of **{{amount_owed}}** remains outstanding.

**TAKE NOTICE** that unless the said sum is paid to our client within **{{days_to_pay}} days** of the date of this letter, we have firm instructions to commence legal proceedings against you without further notice, claiming the debt, interest and the full cost of the action.

Payment should be made to: {{payment_details}}.

We trust you will treat this matter with the urgency it deserves.

Yours faithfully,

{{signature}}
**{{me.name}}**
For: {{firm.name}}

cc: {{client.name}}`,
  },
  {
    name: 'Acknowledgement of Instructions',
    category: 'Correspondence',
    description: 'Confirms receipt of a new brief and the next steps.',
    body: `{{today}}

**{{client.name}}**
{{client.address}}

Dear {{client.name}},

# Re: {{matter.title}}

We acknowledge with thanks your instructions in respect of the above matter, received on {{date_instructions_received}}.

We have opened a file under reference **{{matter.number}}**, and {{me.name}} will be handling the matter.

Our immediate next steps are:
1. {{next_step_1}}
2. {{next_step_2}}

Please send us any further documents relevant to the matter. We will keep you informed of progress.

Yours faithfully,

{{signature}}
**{{me.name}}**
{{me.title}}
For: {{firm.name}}`,
  },
  {
    name: 'Update to Client — Adjournment',
    category: 'Litigation',
    description: 'Reports what happened in court and the next date.',
    body: `{{today}}

**{{client.name}}**

Dear {{client.name}},

# {{matter.title}} — Suit No. {{matter.case_number}}

We write to update you on the above matter, which came up before {{matter.judge}} at the {{matter.court}} on {{hearing_date}}.

**What happened:** {{what_happened}}

The matter was adjourned to **{{next_date}}** for {{purpose_of_next_date}}.

{{action_needed_from_client}}

We will continue to keep you informed.

Yours faithfully,

{{signature}}
**{{me.name}}**
For: {{firm.name}}`,
  },
  {
    name: 'Letter of Authority',
    category: 'Correspondence',
    description: 'Client authorises the firm to act or collect documents on their behalf.',
    body: `{{today}}

To: **{{addressee}}**
{{addressee_address}}

Dear Sir/Madam,

# Letter of Authority

I/We, **{{client.name}}**, hereby authorise **{{firm.name}}**, through any of its lawyers, to {{authority_granted}} on my/our behalf.

Any act done by the firm within the scope of this authority shall be treated as done by me/us.

This authority remains valid until {{valid_until}}, unless withdrawn earlier in writing.

Yours faithfully,

______________________
**{{client.name}}**`,
  },
  {
    name: 'Request for Certified True Copy',
    category: 'Litigation',
    description: 'Letter to the court registry for a CTC of a ruling, judgment or proceedings.',
    body: `{{today}}

The Chief Registrar
{{matter.court}}

Dear Sir/Madam,

# Application for Certified True Copy — Suit No. {{matter.case_number}}

We are counsel to {{client.name}} in the above suit, **{{matter.title}}**.

We hereby apply for a Certified True Copy of the {{document_requested}} delivered on {{date_of_document}}.

We undertake to pay the prescribed fees.

Yours faithfully,

{{signature}}
**{{me.name}}**
For: {{firm.name}}`,
  },
]
