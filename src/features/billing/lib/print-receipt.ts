import { format } from 'date-fns'
import type { PaymentRow } from '@/features/billing/types'
import type { Organization } from '@/shared/types/database.types'
import { formatNaira } from '@/shared/lib/format'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

type ReceiptOrg = Pick<Organization, 'name' | 'legal_name' | 'logo_url' | 'phone' | 'billing_email' | 'website'>

/** Open a print-ready payment receipt in a new window and trigger the browser's Save-as-PDF. Clones print-invoice.ts's pattern. */
export function printReceipt(payment: PaymentRow, org: ReceiptOrg): void {
  const invoiceTotal = Number(payment.invoice?.total ?? 0)
  const amountPaidTotal = Number(payment.invoice?.amount_paid ?? 0)
  const previousBalance = invoiceTotal - amountPaidTotal + Number(payment.amount)
  const remainingBalance = invoiceTotal - amountPaidTotal

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(payment.receipt_number ?? 'Receipt')}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;color:#1c1917;margin:40px;font-size:13px}
    h1{font-family:'Playfair Display',Georgia,serif;font-size:28px;margin:0}
    .brand{color:#B38A3E;font-weight:600;display:flex;align-items:center;gap:10px}
    .brand img{height:36px;width:36px;object-fit:contain;border-radius:6px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}
    .muted{color:#78716c} table{width:100%;border-collapse:collapse;margin-top:24px}
    th,td{padding:10px 8px;border-bottom:1px solid #e7e5e4;text-align:left} th{font-size:11px;text-transform:uppercase;color:#78716c}
    .r{text-align:right} .totals{margin-top:16px;margin-left:auto;width:300px}
    .totals div{display:flex;justify-content:space-between;padding:6px 8px}
    .totals .grand{border-top:2px solid #1c1917;font-weight:700;font-size:15px}
    .badge{display:inline-block;padding:3px 10px;border-radius:999px;background:#f5f5f4;font-size:11px;text-transform:uppercase}
  </style></head><body>
    <div class="head">
      <div>
        <div class="brand">${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="" />` : ''}<span>${esc(org.legal_name || org.name)}</span></div>
        <div class="muted" style="margin-top:4px">
          ${[org.phone, org.billing_email, org.website].filter(Boolean).map(esc).join(' · ')}
        </div>
      </div>
      <div style="text-align:right"><h1>Receipt</h1><div class="muted">${esc(payment.receipt_number ?? '')}</div>
        <div class="badge">Payment ${esc(payment.payment_number ?? '')}</div></div>
    </div>
    <div class="head">
      <div><div class="muted">Received from</div><strong>${esc(payment.client?.display_name ?? '—')}</strong>
        ${payment.matter ? `<div class="muted">${esc(payment.matter.matter_number)} — ${esc(payment.matter.title)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div><span class="muted">Payment date</span> ${esc(payment.paid_at)}</div>
        <div><span class="muted">Invoice</span> ${esc(payment.invoice?.invoice_number ?? '')}</div>
        ${payment.method ? `<div><span class="muted">Method</span> ${esc(payment.method)}</div>` : ''}
        ${payment.reference ? `<div><span class="muted">Reference</span> ${esc(payment.reference)}</div>` : ''}
      </div>
    </div>
    <div class="totals">
      <div><span class="muted">Invoice total</span><span>${formatNaira(invoiceTotal)}</span></div>
      <div><span class="muted">Balance before this payment</span><span>${formatNaira(previousBalance)}</span></div>
      <div class="grand"><span>Amount received</span><span>${formatNaira(Number(payment.amount))}</span></div>
      <div><span class="muted">Balance remaining</span><span>${formatNaira(remainingBalance)}</span></div>
    </div>
    ${payment.notes ? `<p class="muted" style="margin-top:24px">${esc(payment.notes)}</p>` : ''}
    <p class="muted" style="margin-top:32px;font-size:11px">
      Recorded ${payment.created_at ? format(new Date(payment.created_at), 'PPp') : ''}${payment.created_by_profile?.full_name ? ` by ${esc(payment.created_by_profile.full_name)}` : ''} · Powered by The Counsel
    </p>
    <script>window.onload=function(){window.print()}</script>
  </body></html>`

  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
