import type { InvoiceDetail } from '@/features/billing/types'
import { formatNaira } from '@/shared/lib/format'
import { amountInWords, esc, facts, letterhead, openPrintDocument, printDate, signatureBlock, type BadgeTone, type PrintFirm } from '@/shared/lib/print-document'

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  sent: { label: 'Awaiting payment', tone: 'gold' },
  partial: { label: 'Part paid', tone: 'gold' },
  paid: { label: 'Paid', tone: 'green' },
  void: { label: 'Void', tone: 'grey' },
}

/** Open a print-ready invoice in a new window and trigger the browser's Save-as-PDF. */
export function printInvoice(
  inv: InvoiceDetail,
  firm: PrintFirm,
  opts: { signatures?: Record<string, string>; signer?: { id: string; name: string | null; title?: string | null } | null; win?: Window | null } = {},
): void {
  const balance = Number(inv.total) - Number(inv.amount_paid)
  const overdue = balance > 0 && inv.status !== 'void' && inv.status !== 'draft' && !!inv.due_date && new Date(inv.due_date + 'T23:59:59') < new Date()
  const badge = overdue ? { label: 'Overdue', tone: 'red' as const } : STATUS[inv.status] ?? null

  const rows = inv.items
    .map(
      (i, n) => `<tr>
        <td class="muted">${n + 1}</td>
        <td>${esc(i.description)}</td>
        <td class="r">${Number(i.quantity)}${i.unit ? ' ' + esc(i.unit) : ''}</td>
        <td class="r">${formatNaira(Number(i.rate))}</td>
        <td class="r"><strong>${formatNaira(Number(i.amount))}</strong></td>
      </tr>`,
    )
    .join('')

  const body = `
    <section class="parties">
      <div class="party">
        <h2 class="sec">Billed to</h2>
        <div class="who">${esc(inv.client?.display_name ?? '—')}</div>
        ${inv.matter ? `<div class="sub">Matter ${esc(inv.matter.matter_number)}</div>` : ''}
      </div>
      ${facts([
        ['Invoice no.', esc(inv.invoice_number)],
        ['Issue date', esc(printDate(inv.issue_date))],
        ['Due date', inv.due_date ? esc(printDate(inv.due_date)) : 'On receipt'],
        ['Amount due', esc(formatNaira(balance))],
      ])}
    </section>
    <table class="lines">
      <thead><tr><th style="width:28px">#</th><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" class="muted">No line items</td></tr>'}</tbody>
    </table>
    <div class="sum-row">
    <div>${inv.status === 'paid' ? '<div class="stamp">PAID</div>' : ''}</div>
    <div class="sum">
      <div><span class="muted">Subtotal</span><span>${formatNaira(Number(inv.subtotal))}</span></div>
      ${Number(inv.discount) > 0 ? `<div><span class="muted">Discount</span><span>−${formatNaira(Number(inv.discount))}</span></div>` : ''}
      ${Number(inv.tax) > 0 ? `<div><span class="muted">Tax${Number(inv.tax_rate) ? ` (${Number(inv.tax_rate)}%)` : ''}</span><span>${formatNaira(Number(inv.tax))}</span></div>` : ''}
      <div class="strong"><span>Invoice total</span><span>${formatNaira(Number(inv.total))}</span></div>
      ${Number(inv.amount_paid) > 0 ? `<div><span class="muted">Paid to date</span><span>−${formatNaira(Number(inv.amount_paid))}</span></div>` : ''}
    </div>
    </div>
    ${balance > 0 && inv.status !== 'void' ? `<div class="hero">
      <div><div class="k">Balance due${inv.due_date ? ` by ${esc(printDate(inv.due_date))}` : ''}</div><div class="words">${esc(amountInWords(balance))}</div></div>
      <div class="v">${formatNaira(balance)}</div>
    </div>` : ''}
    ${inv.payments.length ? `<div style="margin-top:6mm"><h2 class="sec">Payments received</h2>
      <table class="lines"><thead><tr><th>Date</th><th>Receipt</th><th>Method</th><th class="r">Amount</th></tr></thead><tbody>
      ${inv.payments.map((p) => `<tr><td>${esc(printDate(p.paid_at, 'd MMM yyyy'))}</td><td>${esc(p.receipt_number ?? '—')}</td><td>${esc(p.method ?? '—')}</td><td class="r">${formatNaira(Number(p.amount))}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    ${inv.notes ? `<div class="note"><div class="t">Notes &amp; payment instructions</div>${esc(inv.notes)}</div>` : ''}
    <div class="sigs">
      ${signatureBlock('Authorised signatory', opts.signer?.name ?? null, [opts.signer?.title, `For ${firm.legal_name || firm.name}`].filter(Boolean).join(' · '), opts.signer ? opts.signatures?.[opts.signer.id] : null)}
      <div class="sig"></div>
    </div>
    <p class="muted" style="margin-top:7mm;text-align:center;font-family:'Playfair Display',Georgia,serif;font-size:14px">Thank you for your instruction.</p>
  `

  openPrintDocument({
    title: `${inv.invoice_number ?? 'Invoice'} — ${inv.client?.display_name ?? ''}`,
    firm,
    head: letterhead(firm, { title: 'Invoice', number: inv.invoice_number, badge }),
    body,
    footNote: `Invoice ${inv.invoice_number ?? ''}`,
    win: opts.win,
  })
}
