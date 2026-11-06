import { esc, facts, letterhead, openPrintDocument, printDate, signatureBlock, type PrintFirm } from '@/shared/lib/print-document'
import { ratingLabel, type AppraisalDetail } from '@/features/appraisals/hooks/use-appraisals'

const dots = (n: number | null | undefined) =>
  n ? `<span class="dots">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span> <b>${n}</b>` : '<span class="muted">—</span>'

const para = (title: string, text: string | null | undefined) =>
  text ? `<div class="note"><div class="t">${esc(title)}</div>${esc(text).replace(/\n/g, '<br>')}</div>` : ''

const CSS = `
  .dots{display:inline-flex;gap:3px;vertical-align:middle}
  .dots i{width:8px;height:8px;border-radius:50%;background:#E7E1D6;display:inline-block}
  .dots i.on{background:#B38A3E}
  table.lines td.c{white-space:nowrap}
  table.lines .cmt{color:#57534e;font-size:11px;margin-top:3px}
  .overall{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:6mm 0 0}
  .overall div{border:1px solid #EFE6D4;background:#FAF7F1;border-radius:10px;padding:10px 14px}
  .overall .k{font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;color:#8a817a}
  .overall .v{font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:700;margin-top:2px}
  .overall .l{font-size:11px;color:#57534e}
  .overall .final{background:#1c1917;border-color:#1c1917;color:#fff}
  .overall .final .k{color:#D9B56E} .overall .final .l{color:#d6d3d1}
  h2.sec{margin-top:7mm}
`

/** Print-ready appraisal form with the firm's letterhead and e-signatures. */
export function printAppraisal(d: AppraisalDetail, firm: PrintFirm, sigs: Record<string, string>, win?: Window | null) {
  const a = d.appraisal
  const c = d.cycle
  const score = (i: number) => d.scores.find((s) => s.competency === i)
  const done = a.status === 'completed'

  const body = `
    <section class="parties">
      <div class="party">
        <h2 class="sec" style="margin-top:0">Staff member</h2>
        <div class="who">${esc(a.employee_name)}</div>
        <div class="sub">${esc([a.job_title, a.department].filter(Boolean).join(' · '))}</div>
        ${a.employee_number ? `<div class="sub">Staff no. ${esc(a.employee_number)}</div>` : ''}
      </div>
      ${facts([
        ['Review', esc(c.name)],
        ['Period', `${esc(printDate(c.period_start, 'd MMM yyyy'))} – ${esc(printDate(c.period_end, 'd MMM yyyy'))}`],
        ['Line manager', esc(a.manager_name)],
        ['Signed off', a.signed_off_at ? esc(printDate(a.signed_off_at)) : null],
      ])}
    </section>

    <div class="overall">
      <div><div class="k">Self rating</div><div class="v">${a.self_overall ?? '—'}</div><div class="l">${esc(ratingLabel(a.self_overall))}</div></div>
      <div><div class="k">Line manager</div><div class="v">${a.manager_overall ?? '—'}</div><div class="l">${esc(ratingLabel(a.manager_overall))}</div></div>
      <div class="final"><div class="k">Final rating</div><div class="v">${a.final_rating ?? '—'}</div><div class="l">${esc(ratingLabel(a.final_rating))}</div></div>
    </div>

    <h2 class="sec">Competencies</h2>
    <table class="lines">
      <thead><tr><th>Competency</th><th>Self</th><th>Line manager</th></tr></thead>
      <tbody>
        ${c.competencies.map((comp, i) => {
          const s = score(i)
          return `<tr>
            <td><b>${esc(comp.name)}</b>${comp.description ? `<div class="cmt">${esc(comp.description)}</div>` : ''}</td>
            <td class="c">${dots(s?.self_rating)}${s?.self_comment ? `<div class="cmt">${esc(s.self_comment)}</div>` : ''}</td>
            <td class="c">${dots(s?.manager_rating)}${s?.manager_comment ? `<div class="cmt">${esc(s.manager_comment)}</div>` : ''}</td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    ${d.goals.length ? `
      <h2 class="sec">Goals for the period</h2>
      <table class="lines">
        <thead><tr><th>Goal</th><th>Self</th><th>Line manager</th></tr></thead>
        <tbody>${d.goals.map((g) => `<tr>
          <td>${esc(g.title)}</td>
          <td class="c">${dots(g.self_rating)}${g.self_comment ? `<div class="cmt">${esc(g.self_comment)}</div>` : ''}</td>
          <td class="c">${dots(g.manager_rating)}${g.manager_comment ? `<div class="cmt">${esc(g.manager_comment)}</div>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table>` : ''}

    ${para('Staff member’s summary', a.self_summary)}
    ${para('Line manager’s assessment', a.manager_summary)}
    ${para('Line manager’s recommendation', a.manager_recommendation)}
    ${a.recommendation || a.sign_off_comment ? para('Final decision', [a.recommendation && `Recommendation: ${a.recommendation}`, a.sign_off_comment].filter(Boolean).join('\n')) : ''}
    ${a.acknowledged_at ? para(a.employee_agrees ? 'Staff member agrees with this appraisal' : 'Staff member does not agree with this appraisal', a.employee_comment) : ''}

    <div class="sigs">
      ${signatureBlock('Staff member', a.employee_name, a.acknowledged_at ? `Acknowledged ${printDate(a.acknowledged_at, 'd MMM yyyy')}` : null, a.employee_signed ? sigs[a.user_id] : null)}
      ${signatureBlock('Line manager', a.manager_name, a.manager_submitted_at ? `Reviewed ${printDate(a.manager_submitted_at, 'd MMM yyyy')}` : null, a.manager_user_id && a.manager_submitted_at ? sigs[a.manager_user_id] : null)}
      ${signatureBlock('Approved by', a.signed_off_by_name, a.signed_off_at ? `Signed off ${printDate(a.signed_off_at, 'd MMM yyyy')}` : null, a.signed_off_by ? sigs[a.signed_off_by] : null)}
    </div>
  `
  openPrintDocument({
    title: `Appraisal — ${a.employee_name} — ${c.name}`,
    firm,
    head: letterhead(firm, { title: 'Performance Appraisal', number: c.name, badge: done ? { label: 'Completed', tone: 'green' } : { label: 'In progress', tone: 'gold' } }),
    body,
    css: CSS,
    footNote: 'Confidential — staff appraisal',
    win,
  })
}
