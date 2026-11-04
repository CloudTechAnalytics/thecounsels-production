import { format } from 'date-fns'
import { formatMoneyCompact, formatNaira } from '@/shared/lib/format'

/**
 * Presentation-ready firm report: landscape A4 pages (cover, executive
 * summary, then one page per section) opened in a print window and saved
 * with the browser's "Save as PDF" — same approach as print-invoice.ts, so
 * no PDF library and nothing leaves the browser. Charts are plain SVG built
 * here: one series each, brand gold, values printed on the marks because a
 * PDF has no hover.
 */

export interface ReportPrintInput {
  firm: { name: string; legalName?: string | null; logoUrl?: string | null }
  preparedBy: string
  period: string
  filtersLabel: string[]
  includeFinancial: boolean
  kpis: {
    activeMatters: number
    closedMatters: number
    activeClients: number
    newClients: number
    billableHours: number
    revenue: number
    outstandingInvoices: number
    hearingsThisWeek: number
    tasksDue: number
  }
  financial: {
    invoiced: number
    collected: number
    outstanding: number
    collectionRate: number
    byMonth: { label: string; value: number }[]
    aging: { label: string; value: number }[]
    topClients: { name: string; invoiced: number; outstanding: number }[]
  }
  productivity: { name: string; role: string; billableHours: number; billableValue: number; mattersLed: number; tasksDone: number }[]
  matters: { total: number; open: number; byStatus: { label: string; value: number }[]; byArea: { label: string; value: number }[]; wipTop: { label: string; value: number }[] }
  clients: { rows: { name: string; type: string; matters: number; invoiced: number; outstanding: number }[]; individuals: number; corporate: number }
}

const GOLD = '#B38A3E'
const GOLD_SOFT = '#E9DCC0'
const INK = '#1c1917'
const MUTED = '#78716c'
const RULE = '#e7e5e4'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

/** Vertical columns with value labels — for a measure over time. */
function columnChart(data: { label: string; value: number }[], fmt: (n: number) => string, w = 620, h = 250): string {
  if (data.length === 0 || data.every((d) => d.value === 0)) return `<p class="empty">No data in this period.</p>`
  const max = Math.max(...data.map((d) => d.value), 1)
  const padL = 8, padB = 28, padT = 22
  const slot = (w - padL * 2) / data.length
  const bw = Math.min(46, slot * 0.6)
  const plotH = h - padB - padT
  const bars = data.map((d, i) => {
    const bh = Math.max((d.value / max) * plotH, d.value > 0 ? 3 : 0)
    const x = padL + i * slot + (slot - bw) / 2
    const y = padT + plotH - bh
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="4" fill="${GOLD}"/>
      ${d.value > 0 ? `<text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="v">${esc(fmt(d.value))}</text>` : ''}
      <text x="${x + bw / 2}" y="${h - 9}" text-anchor="middle" class="l">${esc(d.label)}</text>`
  }).join('')
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img"><line x1="${padL}" x2="${w - padL}" y1="${padT + plotH}" y2="${padT + plotH}" stroke="${RULE}"/>${bars}</svg>`
}

/** Horizontal bars with labels and values — for comparing categories. */
function barList(data: { label: string; value: number }[], fmt: (n: number) => string = String, limit = 8): string {
  const rows = data.filter((d) => d.value > 0).slice(0, limit)
  if (rows.length === 0) return `<p class="empty">No data in this period.</p>`
  const max = Math.max(...rows.map((d) => d.value), 1)
  return `<div class="bars">${rows.map((d) => `
    <div class="bar-row">
      <div class="bar-label">${esc(d.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max((d.value / max) * 100, 2)}%"></div></div>
      <div class="bar-value">${esc(fmt(d.value))}</div>
    </div>`).join('')}</div>`
}

/** Part-to-whole ring for one share (e.g. collected vs invoiced). */
function ring(pct: number, label: string): string {
  const r = 52, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct))
  return `<svg viewBox="0 0 140 140" width="150" height="150" role="img">
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${GOLD_SOFT}" stroke-width="14"/>
    <circle cx="70" cy="70" r="${r}" fill="none" stroke="${GOLD}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${(p / 100) * c} ${c}" transform="rotate(-90 70 70)"/>
    <text x="70" y="70" text-anchor="middle" class="ring-v">${p}%</text>
    <text x="70" y="90" text-anchor="middle" class="ring-l">${esc(label)}</text>
  </svg>`
}

function kpi(label: string, value: string, hint?: string): string {
  return `<div class="kpi"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${esc(value)}</div>${hint ? `<div class="kpi-h">${esc(hint)}</div>` : ''}</div>`
}

function table(headers: string[], rows: (string | number)[][], numericFrom = 1): string {
  if (rows.length === 0) return `<p class="empty">Nothing to show for this period.</p>`
  return `<table><thead><tr>${headers.map((h, i) => `<th class="${i >= numericFrom ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i >= numericFrom ? 'r' : ''}">${esc(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}

function highlights(d: ReportPrintInput): string[] {
  const out: string[] = []
  const f = d.financial
  if (d.includeFinancial && f.invoiced > 0) {
    out.push(`${formatNaira(f.invoiced)} invoiced in the period, with ${f.collectionRate}% collected (${formatNaira(f.collected)}).`)
    const late = f.aging.slice(1).reduce((s, a) => s + a.value, 0)
    if (late > 0) out.push(`${formatNaira(late)} is past due; ${formatNaira(f.aging[3]?.value ?? 0)} of it is more than 60 days old.`)
    if (f.topClients[0]) out.push(`Largest client by billing: ${f.topClients[0].name} (${formatNaira(f.topClients[0].invoiced)}).`)
  }
  const top = d.productivity.filter((p) => p.billableHours > 0).sort((a, b) => b.billableHours - a.billableHours)[0]
  if (top) out.push(`Most billable hours: ${top.name}, ${top.billableHours.toFixed(1)}h.`)
  out.push(`${d.kpis.activeMatters} active matter${d.kpis.activeMatters === 1 ? '' : 's'} and ${d.kpis.activeClients} active client${d.kpis.activeClients === 1 ? '' : 's'}; ${d.kpis.newClients} new client${d.kpis.newClients === 1 ? '' : 's'} in the period.`)
  if (d.matters.byArea[0]) out.push(`Busiest practice area: ${d.matters.byArea[0].label} (${d.matters.byArea[0].value} matter${d.matters.byArea[0].value === 1 ? '' : 's'}).`)
  if (d.kpis.hearingsThisWeek > 0) out.push(`${d.kpis.hearingsThisWeek} hearing${d.kpis.hearingsThisWeek === 1 ? '' : 's'} scheduled in the coming week.`)
  return out
}

export function printFirmReport(d: ReportPrintInput): void {
  const firm = d.firm.legalName || d.firm.name
  const generated = format(new Date(), 'd MMMM yyyy, h:mm a')
  const pages: { title: string; body: string }[] = []

  pages.push({
    title: 'Executive summary',
    body: `
      <div class="kpis">
        ${d.includeFinancial ? kpi('Revenue (invoiced)', formatMoneyCompact(d.kpis.revenue)) : ''}
        ${d.includeFinancial ? kpi('Collected', formatMoneyCompact(d.financial.collected), `${d.financial.collectionRate}% collection rate`) : ''}
        ${d.includeFinancial ? kpi('Outstanding invoices', formatMoneyCompact(d.kpis.outstandingInvoices)) : ''}
        ${kpi('Active matters', String(d.kpis.activeMatters), `${d.kpis.closedMatters} closed`)}
        ${kpi('Active clients', String(d.kpis.activeClients), `${d.kpis.newClients} new`)}
        ${kpi('Billable hours', `${d.kpis.billableHours}h`)}
        ${kpi('Hearings this week', String(d.kpis.hearingsThisWeek))}
        ${kpi('Tasks due', String(d.kpis.tasksDue))}
      </div>
      <div class="two">
        <div class="panel"><h3>Key highlights</h3><ul class="hl">${highlights(d).map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
        <div class="panel"><h3>Matters by practice area</h3>${barList(d.matters.byArea, String, 6)}</div>
      </div>`,
  })

  if (d.includeFinancial) {
    const f = d.financial
    pages.push({
      title: 'Financial performance',
      body: `
        <div class="kpis k4">
          ${kpi('Invoiced', formatNaira(f.invoiced))}${kpi('Collected', formatNaira(f.collected))}
          ${kpi('Outstanding', formatNaira(f.outstanding))}${kpi('Collection rate', `${f.collectionRate}%`)}
        </div>
        <div class="two wide-left">
          <div class="panel"><h3>Invoiced by month</h3>${columnChart(f.byMonth, formatMoneyCompact)}</div>
          <div class="panel center"><h3>Collected vs invoiced</h3>${ring(f.collectionRate, 'collected')}</div>
        </div>
        <div class="panel"><h3>Outstanding by age</h3>${barList(f.aging, formatNaira, 4)}</div>`,
    })
  }

  // Clients & revenue: who the firm works for and what they're billed.
  const clientRows = d.clients.rows.slice(0, 10)
  pages.push({
    title: d.includeFinancial ? 'Clients & revenue' : 'Clients',
    body: `
      <div class="kpis k4">${kpi('Clients', String(d.clients.rows.length))}${kpi('Individuals', String(d.clients.individuals))}${kpi('Corporate', String(d.clients.corporate))}${kpi('New in period', String(d.kpis.newClients))}</div>
      <div class="two ${d.includeFinancial ? 'narrow-left' : ''}">
        ${d.includeFinancial ? `<div class="panel"><h3>Top clients by billing</h3>${barList(d.financial.topClients.map((c) => ({ label: c.name, value: c.invoiced })), formatMoneyCompact, 8)}</div>` : ''}
        <div class="panel" ${d.includeFinancial ? '' : 'style="grid-column: 1 / -1"'}><h3>Client list</h3>${table(
          ['Client', 'Type', 'Matters', ...(d.includeFinancial ? ['Invoiced', 'Outstanding'] : [])],
          clientRows.map((c) => [c.name, c.type, c.matters, ...(d.includeFinancial ? [formatNaira(c.invoiced), formatNaira(c.outstanding)] : [])]),
          2,
        )}${d.clients.rows.length > clientRows.length ? `<p class="note">Top ${clientRows.length} of ${d.clients.rows.length} clients by billing. The Excel export has the full list.</p>` : ''}</div>
      </div>`,
  })

  // Team & matters: who is doing the work, and what the work is.
  const prod = d.productivity.slice(0, 8)
  pages.push({
    title: 'Team & matters',
    body: `
      <div class="two narrow-left">
        <div class="panel"><h3>Billable hours by lawyer</h3>${barList(prod.map((p) => ({ label: p.name, value: Math.round(p.billableHours * 10) / 10 })), (n) => `${n}h`, 8)}</div>
        <div class="panel"><h3>Team detail</h3>${table(
          ['Lawyer', 'Billable hrs', ...(d.includeFinancial ? ['Billable value'] : []), 'Matters led', 'Tasks done'],
          prod.map((p) => [p.name, p.billableHours.toFixed(1), ...(d.includeFinancial ? [formatNaira(Math.round(p.billableValue))] : []), p.mattersLed, p.tasksDone]),
        )}</div>
      </div>
      <div class="three">
        <div class="panel"><h3>Matters by status</h3>${barList(d.matters.byStatus, String, 6)}</div>
        <div class="panel"><h3>Matters by practice area</h3>${barList(d.matters.byArea, String, 6)}</div>
        <div class="panel">${d.includeFinancial
          ? `<h3>Work in progress (unbilled)</h3>${table(['Matter', 'Unbilled'], d.matters.wipTop.slice(0, 5).map((w) => [w.label, formatMoneyCompact(Math.round(w.value))]))}`
          : `<h3>Matter totals</h3>${table(['', 'Matters'], [['Total', d.matters.total], ['Open', d.matters.open], ['Active', d.kpis.activeMatters], ['Closed', d.kpis.closedMatters]])}`}</div>
      </div>`,
  })

  const total = pages.length + 1
  const footer = (n: number) => `<div class="foot"><span>${esc(firm)} · Firm Performance Report · ${esc(d.period)}</span><span>Confidential · Page ${n} of ${total}</span></div>`

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(firm)} — Firm Performance Report — ${esc(d.period)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 landscape; margin: 0 }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    body { margin: 0; font-family: Inter, Arial, sans-serif; color: ${INK}; background: #f5f5f4 }
    .page { width: 297mm; height: 210mm; padding: 14mm 16mm 12mm; background: #fff; position: relative; overflow: hidden; page-break-after: always; break-after: page; margin: 0 auto 8mm }
    .page:last-child { page-break-after: auto; break-after: auto }
    @media print { body { background: #fff } .page { margin: 0 } }
    h1, h2, h3 { font-family: 'Playfair Display', Georgia, serif; margin: 0 }
    .bar-top { position: absolute; top: 0; left: 0; right: 0; height: 5mm; background: ${GOLD} }
    .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid ${RULE}; padding-bottom: 4mm; margin-bottom: 6mm }
    .head h2 { font-size: 22pt }
    .head .meta { font-size: 9pt; color: ${MUTED}; text-align: right }
    .foot { position: absolute; left: 16mm; right: 16mm; bottom: 7mm; display: flex; justify-content: space-between; font-size: 8pt; color: ${MUTED}; border-top: 1px solid ${RULE}; padding-top: 2.5mm }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin-bottom: 6mm }
    .kpi { border: 1px solid ${RULE}; border-left: 3px solid ${GOLD}; border-radius: 3mm; padding: 3.5mm 4mm }
    .kpi-l { font-size: 8.5pt; color: ${MUTED}; text-transform: uppercase; letter-spacing: .04em }
    .kpi-v { font-family: 'Playfair Display', Georgia, serif; font-size: 20pt; font-weight: 700; margin-top: 1mm }
    .kpi-h { font-size: 8.5pt; color: ${MUTED}; margin-top: .5mm }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 6mm }
    .two.wide-left { grid-template-columns: 2fr 1fr }
    .two.narrow-left { grid-template-columns: 2fr 3fr }
    .three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6mm }
    td:first-child { white-space: nowrap; max-width: 70mm; overflow: hidden; text-overflow: ellipsis }
    .panel { border: 1px solid ${RULE}; border-radius: 3mm; padding: 4mm 5mm }
    .panel h3 { font-size: 12pt; margin-bottom: 3mm }
    .panel.center { display: flex; flex-direction: column; align-items: center }
    svg text.v { font-size: 10px; fill: ${INK}; font-weight: 600 } svg text.l { font-size: 10px; fill: ${MUTED} }
    svg text.ring-v { font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 700; fill: ${INK} } svg text.ring-l { font-size: 10px; fill: ${MUTED} }
    .bars { display: flex; flex-direction: column; gap: 2.5mm }
    .bar-row { display: grid; grid-template-columns: 38% 1fr 22%; align-items: center; gap: 3mm; font-size: 9.5pt }
    .bar-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
    .bar-track { height: 4mm; background: #f5f0e6; border-radius: 2mm; overflow: hidden }
    .bar-fill { height: 100%; background: ${GOLD}; border-radius: 2mm }
    .bar-value { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt }
    th { text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; color: ${MUTED}; border-bottom: 1.5px solid ${INK}; padding: 2mm 2mm }
    td { padding: 2mm 2mm; border-bottom: 1px solid ${RULE}; font-variant-numeric: tabular-nums }
    tr:nth-child(even) td { background: #faf8f4 }
    .r { text-align: right }
    .hl { margin: 0; padding-left: 5mm; font-size: 10.5pt; line-height: 1.55 } .hl li { margin-bottom: 1.5mm }
    .empty, .note { color: ${MUTED}; font-size: 9.5pt } .note { margin-top: 2mm }
    .cover { background: #1c1917; color: #fff; display: flex; flex-direction: column; justify-content: space-between; padding: 22mm 24mm }
    .cover .brand { display: flex; align-items: center; gap: 5mm; font-size: 13pt; font-weight: 600; color: ${GOLD} }
    .cover .brand img { height: 16mm; width: 16mm; object-fit: contain; border-radius: 2mm; background: #fff }
    .cover h1 { font-size: 40pt; line-height: 1.1; color: #fff; margin-top: 4mm }
    .cover .sub { font-size: 14pt; color: #d6d3d1; margin-top: 4mm }
    .cover .rule { width: 40mm; height: 1.5mm; background: ${GOLD}; margin: 8mm 0 6mm }
    .cover dl { display: grid; grid-template-columns: auto 1fr; gap: 2mm 8mm; font-size: 10.5pt; color: #d6d3d1; margin: 0 }
    .cover dt { color: #a8a29e } .cover dd { margin: 0; color: #fff }
    .cover .conf { font-size: 8.5pt; color: #a8a29e }
  </style></head><body>
    <section class="page cover">
      <div class="brand">${d.firm.logoUrl ? `<img src="${esc(d.firm.logoUrl)}" alt="">` : ''}<span>${esc(firm)}</span></div>
      <div>
        <h1>Firm Performance Report</h1>
        <div class="sub">${esc(d.period)}</div>
        <div class="rule"></div>
        <dl>
          <dt>Prepared for</dt><dd>${esc(firm)} — partners &amp; management</dd>
          <dt>Prepared by</dt><dd>${esc(d.preparedBy)}</dd>
          <dt>Generated</dt><dd>${esc(generated)}</dd>
          <dt>Filters</dt><dd>${esc(d.filtersLabel.length ? d.filtersLabel.join(' · ') : 'Whole firm, all lawyers, clients and practice areas')}</dd>
          <dt>Contents</dt><dd>${pages.map((p) => esc(p.title)).join(' · ')}</dd>
        </dl>
      </div>
      <div class="conf">Confidential — prepared from live data in The Counsel. Figures reflect records at the time of generation.</div>
    </section>
    ${pages.map((p, i) => `
      <section class="page">
        <div class="bar-top"></div>
        <div class="head"><h2>${esc(p.title)}</h2><div class="meta">${esc(firm)}<br>${esc(d.period)}</div></div>
        ${p.body}
        ${footer(i + 2)}
      </section>`).join('')}
    <script>
      (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())
        .then(function () { setTimeout(function () { window.print() }, 250) })
    </script>
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
}
