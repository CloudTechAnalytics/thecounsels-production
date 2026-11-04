import { format } from 'date-fns'
import type { Organization } from '@/shared/types/database.types'
import type { Payslip } from '@/features/payroll/types'
import { formatNaira } from '@/shared/lib/format'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

type PayslipOrg = Pick<Organization, 'name' | 'legal_name' | 'logo_url' | 'phone' | 'billing_email' | 'website'>

const row = (label: string, amount: number, note?: string | null) =>
  amount ? `<div class="line"><span>${esc(label)}${note ? ` <span class="muted">(${esc(note)})</span>` : ''}</span><span>${formatNaira(amount)}</span></div>` : ''

/** Opens a print-ready payslip in a new window and triggers Save-as-PDF. Same pattern as print-receipt.ts. */
export function printPayslip(p: Payslip, period: string, org: PayslipOrg): void {
  const month = format(new Date(period + 'T00:00:00'), 'MMMM yyyy')
  const deductions = Number(p.pension_employee) + Number(p.nhf) + Number(p.paye) + Number(p.other_deductions)
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payslip ${esc(month)} — ${esc(p.employee_name)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Inter,Arial,sans-serif;color:#1c1917;margin:40px;font-size:13px}
    h1{font-family:'Playfair Display',Georgia,serif;font-size:28px;margin:0}
    .brand{color:#B38A3E;font-weight:600;display:flex;align-items:center;gap:10px}
    .brand img{height:36px;width:36px;object-fit:contain;border-radius:6px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
    .muted{color:#78716c} .grid{display:grid;grid-template-columns:1fr 1fr;gap:32px}
    h3{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;border-bottom:1px solid #e7e5e4;padding-bottom:6px;margin:0 0 6px}
    .line{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f4}
    .total{display:flex;justify-content:space-between;padding:8px 0;font-weight:700}
    .net{margin-top:28px;display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border:2px solid #1c1917;border-radius:8px;font-size:16px;font-weight:700}
    .info div{padding:3px 0}
  </style></head><body>
    <div class="head">
      <div>
        <div class="brand">${org.logo_url ? `<img src="${esc(org.logo_url)}" alt="" />` : ''}<span>${esc(org.legal_name || org.name)}</span></div>
        <div class="muted" style="margin-top:4px">${[org.phone, org.billing_email, org.website].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
      <div style="text-align:right"><h1>Payslip</h1><div class="muted">${esc(month)}</div></div>
    </div>
    <div class="grid info" style="margin-bottom:28px">
      <div>
        <div><strong>${esc(p.employee_name)}</strong></div>
        ${p.job_title ? `<div class="muted">${esc(p.job_title)}${p.department ? ` · ${esc(p.department)}` : ''}</div>` : ''}
      </div>
      <div style="text-align:right">
        ${p.bank_name || p.account_number ? `<div><span class="muted">Bank</span> ${esc([p.bank_name, p.account_number].filter(Boolean).join(' · '))}</div>` : ''}
        ${p.tax_id ? `<div><span class="muted">Tax ID</span> ${esc(p.tax_id)}</div>` : ''}
        ${p.pension_pin ? `<div><span class="muted">Pension PIN</span> ${esc(p.pension_pin)}</div>` : ''}
      </div>
    </div>
    <div class="grid">
      <div>
        <h3>Earnings</h3>
        ${row('Basic salary', Number(p.basic))}
        ${row('Housing allowance', Number(p.housing))}
        ${row('Transport allowance', Number(p.transport))}
        ${row('Other allowances', Number(p.other_allowances))}
        <div class="total"><span>Gross pay</span><span>${formatNaira(Number(p.gross))}</span></div>
      </div>
      <div>
        <h3>Deductions</h3>
        ${row('PAYE tax', Number(p.paye))}
        ${row('Pension (employee)', Number(p.pension_employee))}
        ${row('National Housing Fund', Number(p.nhf))}
        ${row('Other deductions', Number(p.other_deductions), p.other_deductions_note)}
        <div class="total"><span>Total deductions</span><span>${formatNaira(deductions)}</span></div>
      </div>
    </div>
    <div class="net"><span>Net pay</span><span>${formatNaira(Number(p.net))}</span></div>
    ${Number(p.pension_employer) ? `<p class="muted" style="margin-top:16px">Employer pension contribution (not deducted from your pay): ${formatNaira(Number(p.pension_employer))}</p>` : ''}
    <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
