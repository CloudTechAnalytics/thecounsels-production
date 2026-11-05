import type { FundRequest } from '@/features/funds/types'
import { DISBURSEMENT_METHODS, FUND_STATUS_META, fundCategoryLabel, outstandingBalance } from '@/features/funds/types'
import { formatNaira } from '@/shared/lib/format'
import { amountInWords, esc, facts, letterhead, openPrintDocument, printDate, signatureBlock, type BadgeTone, type PrintFirm } from '@/shared/lib/print-document'

const TONE: Record<string, BadgeTone> = { closed: 'green', retired: 'green', rejected: 'red', withdrawn: 'grey', draft: 'grey' }

/** A printable fund request / payment voucher: the request, every approval,
 * the payout and the retirement position, signed by the people involved. */
export function printFundVoucher(r: FundRequest, firm: PrintFirm, opts: { signatures?: Record<string, string>; win?: Window | null } = {}): void {
  const sig = (id: string | null | undefined) => (id ? opts.signatures?.[id] : null)
  const paid = r.disbursed_amount != null
  const approved = r.approvals.filter((a) => a.round === r.current_round && a.status === 'approved' && a.acted_by)
  const method = DISBURSEMENT_METHODS.find((m) => m.value === r.disbursement_method)?.label ?? r.disbursement_method
  const accepted = r.items.filter((i) => i.review_status === 'accepted')
  const owed = paid ? outstandingBalance(r) : 0

  const approvalRows = r.approvals
    .filter((a) => a.round === r.current_round)
    .map((a) => `<tr>
      <td>${esc(a.step_name ?? `Step ${a.step}`)}</td>
      <td>${esc(a.actor_name ?? a.approver_name ?? '—')}${a.acted_as_delegate_for ? ' <span class="muted">(delegate)</span>' : ''}</td>
      <td>${esc(a.status === 'approved' ? 'Approved' : a.status === 'rejected' ? 'Rejected' : a.status === 'returned' ? 'Returned' : 'Pending')}${a.approved_amount != null ? ` · ${formatNaira(Number(a.approved_amount))}` : ''}</td>
      <td>${esc(a.acted_at ? printDate(a.acted_at, 'd MMM yyyy') : '—')}</td>
      <td class="muted">${esc(a.comment ?? '')}</td>
    </tr>`)
    .join('')

  const body = `
    <section class="parties">
      <div class="party">
        <h2 class="sec">Requested by</h2>
        <div class="who">${esc(r.requester_name ?? '—')}</div>
        <div class="sub">${esc(r.title)}</div>
        ${r.client_label || r.matter_label ? `<div class="sub">${esc([r.client_label, r.matter_label].filter(Boolean).join(' · '))}</div>` : ''}
      </div>
      ${facts([
        ['Request no.', esc(r.request_number)],
        ['Category', esc(fundCategoryLabel(r.category))],
        ['Submitted', esc(r.submitted_at ? printDate(r.submitted_at) : null)],
        ['Needed by', esc(r.needed_by ? printDate(r.needed_by) : null)],
        ['Amount requested', esc(formatNaira(Number(r.amount)))],
        ['Amount approved', esc(r.approved_amount != null ? formatNaira(Number(r.approved_amount)) : null)],
      ])}
    </section>
    ${r.purpose ? `<div class="note" style="margin-top:0"><div class="t">Purpose</div>${esc(r.purpose).replace(/\n/g, '<br>')}</div>` : ''}

    <div style="margin-top:5mm">
      <h2 class="sec">Approvals</h2>
      <table class="lines"><thead><tr><th>Step</th><th>Approver</th><th>Decision</th><th>Date</th><th>Comment</th></tr></thead>
        <tbody>${approvalRows || '<tr><td colspan="5" class="muted">Not yet submitted for approval</td></tr>'}</tbody></table>
    </div>

    ${paid ? `<div class="hero">
      <div><div class="k">Paid out ${esc(printDate(r.disbursed_at))}${method ? ` · ${esc(method)}` : ''}${r.disbursement_reference ? ` · ${esc(r.disbursement_reference)}` : ''}</div>
        <div class="words">${esc(amountInWords(Number(r.disbursed_amount)))}</div></div>
      <div class="v">${formatNaira(Number(r.disbursed_amount))}</div>
    </div>` : ''}

    ${paid ? `<div style="margin-top:5mm">
      <h2 class="sec">Retirement</h2>
      ${accepted.length ? `<table class="lines"><thead><tr><th>Date</th><th>Expense</th><th class="r">Amount</th></tr></thead><tbody>
        ${accepted.map((i) => `<tr><td>${esc(i.spent_on ? printDate(i.spent_on, 'd MMM yyyy') : '—')}</td><td>${esc(i.description)}${i.vendor ? ` <span class="muted">· ${esc(i.vendor)}</span>` : ''}</td><td class="r">${formatNaira(Number(i.amount))}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">No verified expenses yet.</p>'}
      <div class="sum">
        <div><span class="muted">Paid out</span><span>${formatNaira(Number(r.disbursed_amount))}</span></div>
        <div><span class="muted">Verified expenses</span><span>−${formatNaira(Number(r.accepted_amount))}</span></div>
        ${Number(r.refunded_amount) ? `<div><span class="muted">Refunded to the firm</span><span>−${formatNaira(Number(r.refunded_amount))}</span></div>` : ''}
        ${Number(r.reimbursed_amount) ? `<div><span class="muted">Reimbursed to employee</span><span>+${formatNaira(Number(r.reimbursed_amount))}</span></div>` : ''}
        ${Number(r.excess_borne) ? `<div><span class="muted">Borne by employee</span><span>+${formatNaira(Number(r.excess_borne))}</span></div>` : ''}
        <div class="strong"><span>${owed > 0 ? 'Still to account for' : owed < 0 ? 'Owed to employee' : 'Fully accounted for'}</span><span>${formatNaira(Math.abs(owed))}</span></div>
      </div>
    </div>` : ''}

    <div class="sigs">
      ${signatureBlock('Requested by', r.requester_name, r.submitted_at ? printDate(r.submitted_at, 'd MMM yyyy') : null, sig(r.user_id))}
      ${approved.length
        ? approved.slice(-2).map((a) => signatureBlock(a.step_name ? `Approved · ${a.step_name}` : 'Approved by', a.actor_name ?? a.approver_name, a.acted_at ? printDate(a.acted_at, 'd MMM yyyy') : null, sig(a.acted_by))).join('')
        : signatureBlock('Approved by', null, null, null)}
      ${signatureBlock('Paid by', paid ? r.disbursed_by_name : null, paid && r.disbursed_at ? printDate(r.disbursed_at, 'd MMM yyyy') : null, paid ? sig(r.disbursed_by) : null)}
    </div>
  `

  openPrintDocument({
    title: `${r.request_number ?? 'Fund request'} — ${r.requester_name ?? ''}`,
    firm,
    head: letterhead(firm, { title: 'Fund Request', number: r.request_number, badge: { label: FUND_STATUS_META[r.status]?.label ?? r.status, tone: TONE[r.status] ?? 'gold' } }),
    body,
    footNote: `Fund request ${r.request_number ?? ''} · ${fundCategoryLabel(r.category)}`,
    // Denser than an invoice so the signature row stays on page one.
    css: `
      .lh{padding:9mm 0 5mm} .doc-title{font-size:28px} .parties{margin:5mm 0 4mm}
      table.lines th{padding:7px 10px} table.lines td{padding:6px 10px}
      .hero{margin-top:5mm;padding:11px 18px} .hero .v{font-size:24px}
      .sum{margin-top:3mm} .sum div{padding:3px 10px} .sigs{margin-top:7mm} .sig-img{height:46px}
      .note{padding:8px 14px}
    `,
    win: opts.win,
  })
}
