// ============================================================================
// Edge Function: send-invoice-email
// Emails an invoice to the client: firm letterhead, line items, totals and
// the balance due rendered in the email body, replies going to the sender.
// Same posture as send-client-communication: the caller's own JWT decides
// access (RLS must let them read the invoice, and they need invoices.manage),
// only then does the service-role client do the send and bookkeeping.
//
// Deploy:  supabase functions deploy send-invoice-email --no-verify-jwt
// Secrets: RESEND_API_KEY / RESEND_FROM_EMAIL (shared with the other senders).
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const GOLD = '#B38A3E'
const INK = '#1c1917'
const MUTED = '#78716c'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function esc(s: string | number | null | undefined): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

const naira = (n: number) => '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function longDate(d: string | null | undefined): string {
  if (!d) return '—'
  const date = new Date(d.length === 10 ? d + 'T00:00:00' : d)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface Item { description: string; quantity: number; unit: string | null; rate: number; amount: number }

function invoiceHtml(p: {
  firm: { name: string; logo_url: string | null; phone: string | null; billing_email: string | null; website: string | null }
  inv: { invoice_number: string | null; issue_date: string; due_date: string | null; subtotal: number; discount: number; tax: number; tax_rate: number; total: number; amount_paid: number; notes: string | null }
  clientName: string
  matter: string | null
  items: Item[]
  message: string
  senderName: string
}): string {
  const { firm, inv } = p
  const balance = Number(inv.total) - Number(inv.amount_paid)
  const contacts = [firm.phone, firm.billing_email, firm.website].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ')
  const initials = firm.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const mark = firm.logo_url
    ? `<img src="${esc(firm.logo_url)}" width="48" height="48" alt="" style="display:block;border-radius:8px;object-fit:contain">`
    : `<div style="width:48px;height:48px;border-radius:10px;background:${INK};color:#D9B56E;font:700 20px Georgia,serif;line-height:48px;text-align:center">${esc(initials)}</div>`
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:5px 0;color:${strong ? INK : MUTED};font-size:13px;${strong ? 'font-weight:700' : ''}">${label}</td><td align="right" style="padding:5px 0;font-size:13px;${strong ? 'font-weight:700' : ''}">${value}</td></tr>`
  const items = p.items
    .map(
      (i, n) => `<tr style="background:${n % 2 ? '#FCFBF8' : '#ffffff'}">
        <td style="padding:10px 12px;font-size:13px;border-bottom:1px solid #EEEAE4">${esc(i.description)}</td>
        <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #EEEAE4;white-space:nowrap">${Number(i.quantity)}${i.unit ? ' ' + esc(i.unit) : ''}</td>
        <td align="right" style="padding:10px 12px;font-size:13px;border-bottom:1px solid #EEEAE4;white-space:nowrap">${naira(Number(i.amount))}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="height:6px;background:${GOLD}"></td></tr>
    <tr><td style="padding:24px 28px;border-bottom:1px solid #e7e5e4">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="60" valign="middle">${mark}</td>
        <td valign="middle" style="padding-left:12px">
          <div style="font:700 18px Georgia,serif">${esc(firm.name)}</div>
          ${contacts ? `<div style="color:${MUTED};font-size:11px;margin-top:3px">${contacts}</div>` : ''}
        </td>
        <td align="right" valign="middle">
          <div style="font:700 24px Georgia,serif">Invoice</div>
          <div style="color:${MUTED};font-size:12px">${esc(inv.invoice_number)}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px 28px 8px">
      <p style="margin:0 0 6px;font-size:14px">Dear ${esc(p.clientName)},</p>
      <div style="font-size:14px;line-height:1.6;color:${INK}">${esc(p.message).replace(/\n/g, '<br>')}</div>
    </td></tr>
    <tr><td style="padding:16px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F1;border:1px solid #EFE6D4;border-radius:10px">
        <tr>
          <td style="padding:12px 16px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a817a">Issue date</div><div style="font-size:13px;font-weight:700;margin-top:2px">${longDate(inv.issue_date)}</div></td>
          <td style="padding:12px 16px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a817a">Due date</div><div style="font-size:13px;font-weight:700;margin-top:2px">${inv.due_date ? longDate(inv.due_date) : 'On receipt'}</div></td>
          ${p.matter ? `<td style="padding:12px 16px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a817a">Matter</div><div style="font-size:13px;font-weight:700;margin-top:2px">${esc(p.matter)}</div></td>` : ''}
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr style="background:${INK}">
          <th align="left" style="padding:9px 12px;color:#fff;font-size:10px;letter-spacing:1px;text-transform:uppercase">Description</th>
          <th align="right" style="padding:9px 12px;color:#fff;font-size:10px;letter-spacing:1px;text-transform:uppercase">Qty</th>
          <th align="right" style="padding:9px 12px;color:#fff;font-size:10px;letter-spacing:1px;text-transform:uppercase">Amount</th>
        </tr>
        ${items}
      </table>
    </td></tr>
    <tr><td style="padding:12px 28px 0" align="right">
      <table width="260" cellpadding="0" cellspacing="0">
        ${row('Subtotal', naira(Number(inv.subtotal)))}
        ${Number(inv.discount) > 0 ? row('Discount', '−' + naira(Number(inv.discount))) : ''}
        ${Number(inv.tax) > 0 ? row(`Tax${Number(inv.tax_rate) ? ` (${Number(inv.tax_rate)}%)` : ''}`, naira(Number(inv.tax))) : ''}
        ${row('Invoice total', naira(Number(inv.total)), true)}
        ${Number(inv.amount_paid) > 0 ? row('Paid to date', '−' + naira(Number(inv.amount_paid))) : ''}
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:10px">
        <tr>
          <td style="padding:16px 20px;color:#D9B56E;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase">${balance > 0 ? `Balance due${inv.due_date ? ' by ' + longDate(inv.due_date) : ''}` : 'Fully settled'}</td>
          <td align="right" style="padding:16px 20px;color:#ffffff;font:700 24px Georgia,serif;white-space:nowrap">${naira(Math.max(balance, 0))}</td>
        </tr>
      </table>
    </td></tr>
    ${inv.notes ? `<tr><td style="padding:0 28px 16px"><div style="border-left:3px solid ${GOLD};background:#FAF7F1;padding:10px 14px;border-radius:0 8px 8px 0;font-size:13px"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a817a;font-weight:700;margin-bottom:3px">Payment instructions</div>${esc(inv.notes).replace(/\n/g, '<br>')}</div></td></tr>` : ''}
    <tr><td style="padding:8px 28px 24px;font-size:13px;color:${INK}">Kind regards,<br><strong>${esc(p.senderName)}</strong><br><span style="color:${MUTED}">${esc(firm.name)}</span></td></tr>
    <tr><td style="padding:14px 28px;background:#fafaf9;color:${MUTED};font-size:11px">Reply to this email with any questions about this invoice. Sent with The Counsel.</td></tr>
  </table>
  </td></tr></table>
  </body></html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  let body: { invoiceId?: string; to?: string; cc?: string[]; subject?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!body.invoiceId) return json({ error: 'invoiceId is required' }, 400)
  const to = (body.to ?? '').trim()
  if (!EMAIL_RE.test(to)) return json({ error: 'Enter a valid recipient email address.' }, 400)
  const cc = (body.cc ?? []).map((e) => e.trim()).filter(Boolean)
  if (cc.some((e) => !EMAIL_RE.test(e))) return json({ error: 'One of the CC addresses is not a valid email.' }, 400)
  if (cc.length > 5) return json({ error: 'Copy at most 5 people.' }, 400)

  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: visible } = await caller.from('invoices').select('id, organization_id').eq('id', body.invoiceId).maybeSingle()
  if (!visible) return json({ error: 'Invoice not found, or you do not have access to it' }, 404)
  const { data: allowed } = await caller.rpc('has_permission', { org: visible.organization_id, perm: 'invoices.manage' })
  if (!allowed) return json({ error: 'You do not have permission to send invoices.' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: inv } = await admin
    .from('invoices')
    .select('*, client:clients(id, display_name), matter:matters(id, matter_number, title)')
    .eq('id', body.invoiceId)
    .single()
  if (!inv) return json({ error: 'Invoice not found' }, 404)
  if (inv.status === 'void') return json({ error: 'A void invoice cannot be sent.' }, 400)
  if (!inv.client_id) return json({ error: 'This invoice has no client.' }, 400)

  const [{ data: items }, { data: org }, { data: sender }] = await Promise.all([
    admin.from('invoice_items').select('description, quantity, unit, rate, amount').eq('invoice_id', inv.id).order('created_at'),
    admin.from('organizations').select('name, legal_name, logo_url, phone, billing_email, website').eq('id', inv.organization_id).single(),
    admin.from('profiles').select('full_name, email').eq('id', userData.user.id).single(),
  ])
  if (!items || items.length === 0) return json({ error: 'An invoice cannot be sent until it contains at least one item.' }, 400)

  const firmName = org?.legal_name || org?.name || 'Your law firm'
  const subject = (body.subject ?? '').trim() || `Invoice ${inv.invoice_number ?? ''} from ${firmName}`
  const message = (body.message ?? '').trim() || `Please find below invoice ${inv.invoice_number ?? ''} for professional services rendered.`
  const html = invoiceHtml({
    firm: { name: firmName, logo_url: org?.logo_url ?? null, phone: org?.phone ?? null, billing_email: org?.billing_email ?? null, website: org?.website ?? null },
    inv,
    clientName: inv.client?.display_name ?? 'Client',
    matter: inv.matter ? `${inv.matter.matter_number ?? ''} ${inv.matter.title ?? ''}`.trim() : null,
    items: items as Item[],
    message,
    senderName: sender?.full_name ?? firmName,
  })

  // Log it in the client's correspondence first, so a failure is recorded too.
  const { data: comm } = await admin
    .from('client_communications')
    .insert({
      organization_id: inv.organization_id,
      client_id: inv.client_id,
      matter_id: inv.matter_id,
      sent_by: userData.user.id,
      recipient_name: inv.client?.display_name ?? null,
      recipient_email: to,
      subject,
      body: `${message}\n\n[Invoice ${inv.invoice_number ?? ''} attached in the email]`,
      status: 'PENDING',
    })
    .select('id')
    .single()

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const fail = async (reason: string) => {
    if (comm) await admin.from('client_communications').update({ status: 'FAILED', failure_reason: reason }).eq('id', comm.id)
    return json({ error: reason }, 502)
  }
  if (!RESEND_API_KEY) return fail('Email is not configured.')
  const fromAddress = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Counsel <notifications@thecounsels.org>'
  const bare = fromAddress.match(/<([^>]+)>/)?.[1] ?? fromAddress
  const replyTo = [sender?.email, org?.billing_email].filter((e): e is string => Boolean(e && EMAIL_RE.test(e)))

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${firmName.replace(/[<>"]/g, '')} <${bare}>`,
        to: [to],
        ...(cc.length ? { cc } : {}),
        ...(replyTo.length ? { reply_to: replyTo } : {}),
        subject,
        html,
      }),
    })
    if (!res.ok) return fail(`Email provider error (${res.status}): ${(await res.text()).slice(0, 300)}`)
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Email send failed')
  }

  const now = new Date().toISOString()
  if (comm) await admin.from('client_communications').update({ status: 'SENT', sent_at: now }).eq('id', comm.id)
  if (inv.status === 'draft') await admin.from('invoices').update({ status: 'sent' }).eq('id', inv.id)
  await caller.rpc('log_audit', {
    p_org: inv.organization_id,
    p_action: 'invoice.emailed',
    p_entity_type: 'invoice',
    p_entity_id: inv.id,
    p_summary: `Emailed invoice ${inv.invoice_number ?? ''} to ${to}`,
  })

  return json({ ok: true, markedSent: inv.status === 'draft' })
})
