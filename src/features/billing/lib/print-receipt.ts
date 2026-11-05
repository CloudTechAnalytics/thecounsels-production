import type { PaymentRow } from '@/features/billing/types'
import { formatNaira } from '@/shared/lib/format'
import { amountInWords, esc, facts, letterhead, openPrintDocument, printDate, signatureBlock, type PrintFirm } from '@/shared/lib/print-document'

/** Open a print-ready payment receipt in a new window and trigger the browser's Save-as-PDF. */
export function printReceipt(payment: PaymentRow, firm: PrintFirm, opts: { signatures?: Record<string, string>; win?: Window | null } = {}): void {
  const amount = Number(payment.amount)
  const invoiceTotal = Number(payment.invoice?.total ?? 0)
  const amountPaidTotal = Number(payment.invoice?.amount_paid ?? 0)
  const previousBalance = invoiceTotal - amountPaidTotal + amount
  const remainingBalance = invoiceTotal - amountPaidTotal
  const settled = remainingBalance <= 0

  const body = `
    <section class="parties">
      <div class="party">
        <h2 class="sec">Received from</h2>
        <div class="who">${esc(payment.client?.display_name ?? '—')}</div>
        ${payment.matter ? `<div class="sub">${esc(payment.matter.matter_number)} — ${esc(payment.matter.title)}</div>` : ''}
      </div>
      ${facts([
        ['Receipt no.', esc(payment.receipt_number)],
        ['Payment date', esc(printDate(payment.paid_at))],
        ['Invoice', esc(payment.invoice?.invoice_number)],
        ['Method', esc(payment.method)],
        ['Reference', esc(payment.reference)],
        ['Payment no.', esc(payment.payment_number)],
      ])}
    </section>
    <div class="hero">
      <div><div class="k">Amount received</div><div class="words">${esc(amountInWords(amount))}</div></div>
      <div class="v">${formatNaira(amount)}</div>
    </div>
    <table class="lines" style="margin-top:7mm">
      <thead><tr><th>Applied to invoice ${esc(payment.invoice?.invoice_number ?? '')}</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr><td>Invoice total</td><td class="r">${formatNaira(invoiceTotal)}</td></tr>
        <tr><td>Balance before this payment</td><td class="r">${formatNaira(previousBalance)}</td></tr>
        <tr><td>This payment</td><td class="r">−${formatNaira(amount)}</td></tr>
        <tr><td><strong>${settled ? 'Invoice fully settled' : 'Balance remaining'}</strong></td><td class="r"><strong>${formatNaira(Math.max(remainingBalance, 0))}</strong></td></tr>
      </tbody>
    </table>
    ${payment.notes ? `<div class="note"><div class="t">Notes</div>${esc(payment.notes)}</div>` : ''}
    <div class="sigs" style="align-items:flex-end">
      ${signatureBlock('Received by', payment.created_by_profile?.full_name ?? null, `For ${firm.legal_name || firm.name} · ${printDate(payment.created_at, 'd MMM yyyy')}`, payment.created_by ? opts.signatures?.[payment.created_by] : null)}
      <div class="sig" style="text-align:center"><span class="stamp">RECEIVED</span></div>
    </div>
    <p class="muted" style="margin-top:9mm;text-align:center;font-family:'Playfair Display',Georgia,serif;font-size:14px">Thank you for your payment.</p>
  `

  openPrintDocument({
    title: `${payment.receipt_number ?? 'Receipt'} — ${payment.client?.display_name ?? ''}`,
    firm,
    head: letterhead(firm, { title: 'Receipt', number: payment.receipt_number, badge: settled ? { label: 'Invoice settled', tone: 'green' } : { label: 'Part payment', tone: 'gold' } }),
    body,
    footNote: `Official receipt ${payment.receipt_number ?? ''}`,
    win: opts.win,
  })
}
