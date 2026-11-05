import { format } from 'date-fns'

/**
 * Shared letterhead and print window for every document the app generates
 * (invoices, receipts, payslips). Each document opens in a new window and
 * the browser's "Save as PDF" does the rest — no PDF library, nothing leaves
 * the browser. A4 portrait, firm logo and name on top, a footer on every page.
 */

export interface PrintFirm {
  name: string
  legal_name?: string | null
  logo_url?: string | null
  phone?: string | null
  billing_email?: string | null
  website?: string | null
}

export type BadgeTone = 'gold' | 'green' | 'red' | 'grey'

export function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export function printDate(d: string | null | undefined, pattern = 'd MMMM yyyy'): string {
  if (!d) return '—'
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d)
  return Number.isNaN(date.getTime()) ? d : format(date, pattern)
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 &]/g, ' ').split(/\s+/).filter((w) => w && w !== '&')
  return (words.slice(0, 2).map((w) => w[0]).join('') || 'F').toUpperCase()
}

/** Firm logo, or a gold monogram when the firm hasn't uploaded one. */
function mark(firm: PrintFirm): string {
  const mono = (hidden: boolean) => `<div class="mono"${hidden ? ' style="display:none"' : ''}>${esc(initials(firm.name))}</div>`
  if (!firm.logo_url) return mono(false)
  return `<img class="logo" src="${esc(firm.logo_url)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />${mono(true)}`
}

export function letterhead(firm: PrintFirm, doc: { title: string; number?: string | null; badge?: { label: string; tone: BadgeTone } | null }): string {
  const name = firm.legal_name || firm.name
  const contacts = [firm.phone, firm.billing_email, firm.website].filter(Boolean).map((c) => `<span style="white-space:nowrap">${esc(c)}</span>`)
  return `<header class="lh">
    <div class="firm">
      ${mark(firm)}
      <div>
        <div class="firm-name">${esc(name)}</div>
        ${firm.legal_name && firm.legal_name !== firm.name ? `<div class="firm-sub">${esc(firm.name)}</div>` : ''}
        ${contacts.length ? `<div class="firm-contact">${contacts.join('<span class="dot">•</span>')}</div>` : ''}
      </div>
    </div>
    ${doc.title ? `<div class="doc">
      <div class="doc-title">${esc(doc.title)}</div>
      ${doc.number ? `<div class="doc-no">${esc(doc.number)}</div>` : ''}
      ${doc.badge ? `<span class="badge ${doc.badge.tone}">${esc(doc.badge.label)}</span>` : ''}
    </div>` : ''}
  </header>`
}

/** A signature line: the person's saved e-signature above the rule when they
 * have one, then their name and role/date beneath. */
export function signatureBlock(label: string, name?: string | null, sub?: string | null, image?: string | null): string {
  return `<div class="sig">
    <div class="sig-img">${image ? `<img src="${esc(image)}" alt="Signature" />` : ''}</div>
    <div class="sig-line">${esc(label)}${name ? `<br><strong>${esc(name)}</strong>` : ''}${sub ? `<br><span>${esc(sub)}</span>` : ''}</div>
  </div>`
}

/** Label/value pairs in a tidy grid, e.g. dates and references. */
export function facts(items: [string, string | null | undefined][]): string {
  const shown = items.filter(([, v]) => v)
  return `<dl class="facts">${shown.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function under1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '')
  return [h ? `${ONES[h]} hundred` : '', rest].filter(Boolean).join(' and ')
}

function wholeWords(n: number): string {
  if (n === 0) return 'zero'
  const scales = ['', 'thousand', 'million', 'billion', 'trillion']
  const parts: string[] = []
  for (let i = 0; n > 0 && i < scales.length; i++) {
    const chunk = n % 1000
    if (chunk) parts.unshift(`${under1000(chunk)}${scales[i] ? ' ' + scales[i] : ''}`)
    n = Math.floor(n / 1000)
  }
  return parts.join(', ')
}

/** "One hundred and fifty thousand naira, fifty kobo only" — what Nigerian receipts and payslips carry. */
export function amountInWords(amount: number, major = 'naira', minor = 'kobo'): string {
  const abs = Math.abs(Math.round(amount * 100))
  const whole = Math.floor(abs / 100)
  const cents = abs % 100
  const text = `${wholeWords(whole)} ${major}${cents ? `, ${wholeWords(cents)} ${minor}` : ''} only`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const BASE_CSS = `
  @page{size:A4;margin:0}
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{margin:0;background:#f4f1ea}
  body{font-family:Inter,Arial,sans-serif;color:#1c1917;font-size:12.5px;line-height:1.45}
  .sheet{width:210mm;min-height:296mm;margin:0 auto;background:#fff;position:relative;padding:0 16mm 9mm;display:flex;flex-direction:column}
  .band{height:7px;background:#B38A3E;margin:0 -16mm}
  .lh{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:11mm 0 6mm;border-bottom:1px solid #e7e5e4}
  .firm{display:flex;gap:14px;align-items:center;min-width:0}
  .logo{height:58px;width:58px;object-fit:contain;border-radius:10px}
  .mono{height:58px;width:58px;flex:none;border-radius:12px;background:#1c1917;color:#D9B56E;display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:700;letter-spacing:.02em}
  .firm-name{font-family:'Playfair Display',Georgia,serif;font-size:21px;font-weight:700;line-height:1.15}
  .firm-sub{color:#78716c;font-size:11.5px}
  .firm-contact{color:#78716c;font-size:11px;margin-top:5px}
  .dot{color:#B38A3E;margin:0 7px}
  .doc{text-align:right;flex:none}
  .doc-title{font-family:'Playfair Display',Georgia,serif;font-size:34px;font-weight:700;letter-spacing:-.01em;line-height:1;color:#1c1917}
  .doc-no{color:#78716c;font-size:12px;margin-top:7px;font-variant-numeric:tabular-nums}
  .badge{display:inline-block;margin-top:9px;padding:4px 12px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}
  .badge.gold{background:#F5ECDA;color:#8A6420}.badge.green{background:#E3F1E7;color:#1F6B3A}.badge.red{background:#FBE6E3;color:#A23B2A}.badge.grey{background:#F1EFEC;color:#57534e}
  h2.sec{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#B38A3E;margin:0 0 8px}
  .parties{display:grid;grid-template-columns:1.2fr 1fr;gap:20px;margin:7mm 0 6mm}
  .party .who{font-family:'Playfair Display',Georgia,serif;font-size:17px;font-weight:700}
  .party .sub{color:#78716c;margin-top:2px}
  .facts{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;background:#FAF7F1;border:1px solid #EFE6D4;border-radius:10px;padding:13px 16px}
  .facts dt{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#8a817a}
  .facts dd{margin:2px 0 0;font-weight:600;font-variant-numeric:tabular-nums}
  table.lines{width:100%;border-collapse:separate;border-spacing:0}
  table.lines th{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#fff;background:#1c1917;text-align:left;padding:9px 10px;font-weight:600}
  table.lines th+th{box-shadow:-1px 0 0 #1c1917}
  table.lines th:first-child{border-radius:7px 0 0 7px} table.lines th:last-child{border-radius:0 7px 7px 0}
  table.lines td{padding:10px;border-bottom:1px solid #EEEAE4;vertical-align:top;font-variant-numeric:tabular-nums}
  table.lines tbody tr:nth-child(even) td{background:#FCFBF8}
  .r{text-align:right;white-space:nowrap}
  .muted{color:#78716c}
  .sum{margin:5mm 0 0 auto;width:86mm}
  .sum-row{display:flex;justify-content:space-between;align-items:center;gap:20px}
  .sum-row .sum{margin-left:auto}
  .sum div{display:flex;justify-content:space-between;padding:6px 10px;font-variant-numeric:tabular-nums}
  .sum .strong{font-weight:700;border-top:1.5px solid #1c1917;margin-top:3px;padding-top:9px}
  .hero{margin-top:6mm;border-radius:12px;background:#1c1917;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:20px}
  .hero .k{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#D9B56E;font-weight:700}
  .hero .words{color:#d6d3d1;font-size:11px;margin-top:4px;max-width:105mm}
  .hero .v{font-family:'Playfair Display',Georgia,serif;font-size:30px;font-weight:700;white-space:nowrap;font-variant-numeric:lining-nums}
  .note{margin-top:6mm;border-left:3px solid #B38A3E;background:#FAF7F1;padding:10px 14px;border-radius:0 8px 8px 0}
  .note .t{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#8a817a;font-weight:700;margin-bottom:3px}
  .stamp{display:inline-block;transform:rotate(-10deg);border:3px solid rgba(31,107,58,.55);color:rgba(31,107,58,.6);border-radius:10px;padding:6px 16px;font-family:'Playfair Display',Georgia,serif;font-size:30px;font-weight:700;letter-spacing:.12em}
  .sign{display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:14mm}
  .sign>div{flex:1;border-top:1px solid #a8a29e;padding-top:6px;color:#78716c;font-size:11px}
  .sigs{display:flex;gap:28px;margin-top:12mm;break-inside:avoid}
  .sig{flex:1;min-width:0}
  .sig-img{height:54px;display:flex;align-items:flex-end}
  .sig-img img{max-height:52px;max-width:100%;object-fit:contain}
  .sig-line{border-top:1px solid #a8a29e;padding-top:6px;color:#78716c;font-size:11px;line-height:1.5}
  .sig-line strong{color:#1c1917;font-size:12px}
  .foot{margin-top:auto;padding-top:8px;display:flex;justify-content:space-between;gap:16px;border-top:1px solid #e7e5e4;color:#a8a29e;font-size:9.5px}
  .foot b{color:#B38A3E;font-weight:600}
  @media screen{.sheet{margin:24px auto;box-shadow:0 10px 40px rgba(28,25,23,.12)}}
  @media print{html,body{background:#fff}.sheet{margin:0;box-shadow:none}}
`

/** Wraps the body in a page with the letterhead and footer, opens it, and prints once fonts and the logo have loaded. */
export function openPrintDocument(opts: { title: string; firm: PrintFirm; head: string; body: string; footNote?: string; css?: string; win?: Window | null }): void {
  const firmName = opts.firm.legal_name || opts.firm.name
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <style>${BASE_CSS}${opts.css ?? ''}</style></head><body>
    <div class="sheet">
      <div class="band"></div>
      ${opts.head}
      <main>${opts.body}</main>
      <div style="height:8mm"></div>
      <div class="foot"><span>${esc(firmName)} · ${esc(opts.footNote ?? 'Computer-generated document')}</span><span>Generated ${esc(format(new Date(), 'd MMM yyyy, h:mm a'))} · <b>The Counsel</b></span></div>
    </div>
    <script>
      (function () {
        var imgs = Array.prototype.slice.call(document.images).map(function (i) {
          return i.complete ? null : new Promise(function (r) { i.onload = i.onerror = r })
        }).filter(Boolean)
        var fonts = document.fonts ? document.fonts.ready : Promise.resolve()
        var timeout = new Promise(function (r) { setTimeout(r, 2500) })
        Promise.race([Promise.all([fonts].concat(imgs)), timeout]).then(function () { setTimeout(function () { window.print() }, 200) })
      })()
    </script>
  </body></html>`
  const w = opts.win ?? window.open('', '_blank', 'width=900,height=1000')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
}
