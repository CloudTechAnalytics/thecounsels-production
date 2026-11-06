import { format } from 'date-fns'
import type { Payslip } from '@/features/payroll/types'
import { formatNaira } from '@/shared/lib/format'
import { amountInWords, esc, facts, letterhead, openPrintDocument, type PrintFirm } from '@/shared/lib/print-document'

const line = (label: string, amount: number, note?: string | null) =>
  amount ? `<tr><td>${esc(label)}${note ? ` <span class="muted">(${esc(note)})</span>` : ''}</td><td class="r">${formatNaira(amount)}</td></tr>` : ''

/** Opens a print-ready payslip in a new window and triggers Save-as-PDF. */
export function printPayslip(p: Payslip, period: string, firm: PrintFirm): void {
  const month = format(new Date(period + 'T00:00:00'), 'MMMM yyyy')
  const deductions = Number(p.pension_employee) + Number(p.nhf) + Number(p.paye) + Number(p.other_deductions)
  const extras = (Array.isArray(p.extra_lines) ? p.extra_lines : []) as { kind: string; label: string; amount: number; taxable?: boolean }[]
  const salaryOther = Math.round((Number(p.other_deductions) - extras.filter((x) => x.kind === 'deduction' || x.kind === 'loan').reduce((t, x) => t + Number(x.amount), 0)) * 100) / 100
  const gross = Number(p.gross)
  const net = Number(p.net)
  const netShare = gross > 0 ? Math.round((net / gross) * 100) : 0

  const body = `
    <section class="parties">
      <div class="party">
        <h2 class="sec">Employee</h2>
        <div class="who">${esc(p.employee_name)}</div>
        ${p.job_title || p.department ? `<div class="sub">${esc([p.job_title, p.department].filter(Boolean).join(' · '))}</div>` : ''}
        ${p.employee_number ? `<div class="sub">Staff no. ${esc(p.employee_number)}</div>` : ''}
      </div>
      ${facts([
        ['Pay period', esc(month)],
        ['Bank', esc(p.bank_name)],
        ['Account no.', esc(p.account_number)],
        ['Account name', esc(p.account_name)],
        ['Tax ID', esc(p.tax_id)],
        ['Pension PIN', esc(p.pension_pin)],
      ])}
    </section>
    <div class="cols">
      <table class="lines">
        <thead><tr><th>Earnings</th><th class="r">Amount</th></tr></thead>
        <tbody>
          ${line('Basic salary', Number(p.basic))}
          ${line('Housing allowance', Number(p.housing))}
          ${line('Transport allowance', Number(p.transport))}
          ${line('Other allowances', Number(p.other_allowances))}
          ${extras.filter((x) => x.kind !== 'deduction' && x.kind !== 'loan').map((x) => line(x.label, x.amount, x.taxable === false ? 'not taxed' : null)).join('')}
        </tbody>
        <tfoot><tr><td>Gross pay</td><td class="r">${formatNaira(gross)}</td></tr></tfoot>
      </table>
      <table class="lines">
        <thead><tr><th>Deductions</th><th class="r">Amount</th></tr></thead>
        <tbody>
          ${line('PAYE tax', Number(p.paye))}
          ${line('Pension (employee 8%)', Number(p.pension_employee))}
          ${line('National Housing Fund', Number(p.nhf))}
          ${line('Other deductions', salaryOther, p.other_deductions_note)}
          ${extras.filter((x) => x.kind === 'deduction' || x.kind === 'loan').map((x) => line(x.label, x.amount)).join('')}
          ${deductions ? '' : '<tr><td class="muted">No deductions</td><td></td></tr>'}
        </tbody>
        <tfoot><tr><td>Total deductions</td><td class="r">${formatNaira(deductions)}</td></tr></tfoot>
      </table>
    </div>
    <div class="hero">
      <div><div class="k">Net pay · ${esc(month)}</div><div class="words">${esc(amountInWords(net))}</div></div>
      <div class="v">${formatNaira(net)}</div>
    </div>
    <div class="split" aria-hidden="true"><span style="width:${netShare}%"></span></div>
    <div class="split-key"><span>Take-home ${netShare}% of gross</span><span>Deductions ${100 - netShare}%</span></div>
    ${Number(p.pension_employer) ? `<div class="note"><div class="t">Employer contribution</div>Your employer also paid ${formatNaira(Number(p.pension_employer))} into your pension this month. It is not deducted from your pay.</div>` : ''}
    <p class="muted" style="margin-top:9mm;font-size:11px;text-align:center">This payslip is computer-generated and needs no signature. Please keep it confidential.</p>
  `

  openPrintDocument({
    title: `Payslip ${month} — ${p.employee_name}`,
    firm,
    head: letterhead(firm, { title: 'Payslip', number: month, badge: { label: 'Confidential', tone: 'grey' } }),
    body,
    footNote: `Payslip · ${p.employee_name} · ${month}`,
    css: `
      .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
      .cols tfoot td{font-weight:700;border-top:1.5px solid #1c1917;border-bottom:none;padding-top:11px}
      .split{margin-top:5mm;height:8px;border-radius:999px;background:#E9DCC0;overflow:hidden}
      .split span{display:block;height:100%;background:#B38A3E;border-radius:999px}
      .split-key{display:flex;justify-content:space-between;margin-top:5px;color:#78716c;font-size:10.5px}
    `,
  })
}
