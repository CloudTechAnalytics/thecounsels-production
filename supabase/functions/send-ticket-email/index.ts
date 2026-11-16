// ============================================================================
// Edge Function: send-ticket-email
// Emails one message of a conversation between The Counsel and a firm (0210).
//
//   * A message FROM THE PLATFORM goes to each recipient the platform admin
//     chose (and any extra addresses), in The Counsel's design, addressed by
//     first name, with a "Reply in The Counsel" button. Reply-To is the
//     platform admin who wrote it, so answering by email reaches them too.
//   * A REPLY FROM THE FIRM goes to the platform admin who started the
//     conversation (and the assignee), so they know the firm answered.
//
// Deploy:  supabase functions deploy send-ticket-email --no-verify-jwt
// Secrets: RESEND_API_KEY / RESEND_FROM_EMAIL / SITE_URL (already set).
//
// SECURITY: the caller's JWT is validated, the message is read through a
// CALLER-scoped client (so RLS decides whether they may see it), and the
// caller must be the message's author. Only then is the service role used
// to look up addresses and send. emailed_at makes a retry a no-op.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://www.thecounsels.org'
const GOLD = '#B38A3E'
const INK = '#232838'
const MUTED = '#6E6A60'

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const paragraphs = (body: string) =>
  esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('')
const firstName = (full: string | null | undefined) => (full ?? '').trim().split(/\s+/)[0] || ''

function shell(o: { heading: string; greeting: string; body: string; button?: { label: string; href: string }; footer: string }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F3EEE3;font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
  <table width="580" cellpadding="0" cellspacing="0" style="max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden">
    <tr><td style="background:${INK};padding:20px 28px">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="background:${GOLD};color:#fff;font-weight:700;font-size:18px;width:34px;height:34px;text-align:center;border-radius:8px">C</td>
        <td style="padding-left:12px;color:#fff;font-size:13px;letter-spacing:4px;font-weight:700">THE COUNSEL</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:30px 28px 8px">
      <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:${INK}">${esc(o.heading)}</h1>
      <p style="margin:0 0 14px;font-size:15px">${esc(o.greeting)}</p>
      <div style="font-size:15px;line-height:1.6">${o.body}</div>
      ${o.button ? `<table cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="background:${GOLD};border-radius:8px">
        <a href="${o.button.href}" style="display:inline-block;padding:13px 24px;color:#fff;font-weight:700;font-size:14px;text-decoration:none">${esc(o.button.label)}</a>
      </td></tr></table>` : ''}
    </td></tr>
    <tr><td style="padding:18px 28px 26px;color:${MUTED};font-size:12px;line-height:1.5;border-top:1px solid #EEE8DA">
      ${o.footer}<br>The Counsel &nbsp;|&nbsp; <a href="${SITE_URL}" style="color:${GOLD};text-decoration:none">thecounsels.org</a>
    </td></tr>
  </table></td></tr></table></body></html>`
}

async function sendEmail(p: { to: string; subject: string; html: string; replyTo?: string | null }) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'Email is not configured.' }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Counsel <notifications@thecounsels.org>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [p.to], subject: p.subject, html: p.html, ...(p.replyTo ? { reply_to: p.replyTo } : {}) }),
    })
    if (!res.ok) return { ok: false, error: `Resend error (${res.status}): ${(await res.text()).slice(0, 300)}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Email send failed' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  let messageId: string | undefined
  try { messageId = (await req.json()).messageId } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!messageId) return json({ error: 'messageId is required' }, 400)

  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: u } = await caller.auth.getUser()
  if (!u?.user) return json({ error: 'Not authenticated' }, 401)
  const { data: visible } = await caller.from('support_ticket_messages').select('id').eq('id', messageId).maybeSingle()
  if (!visible) return json({ error: 'Message not found, or you do not have access to it' }, 404)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: msg } = await admin.from('support_ticket_messages').select('*').eq('id', messageId).maybeSingle()
  if (!msg) return json({ error: 'Message not found' }, 404)
  if (msg.author_id !== u.user.id) return json({ error: 'Only the author can email a message' }, 403)
  if (msg.emailed_at) return json({ ok: true, skipped: true })

  const { data: t } = await admin.from('support_tickets').select('*').eq('id', msg.ticket_id).maybeSingle()
  if (!t || t.kind !== 'platform_message') return json({ ok: true, skipped: true })
  const { data: org } = await admin.from('organizations').select('name').eq('id', t.organization_id).maybeSingle()
  const { data: author } = await admin.from('profiles').select('full_name, email').eq('id', msg.author_id).maybeSingle()
  const { count } = await admin.from('support_ticket_messages').select('id', { count: 'exact', head: true }).eq('ticket_id', t.id)
  const isReply = (count ?? 1) > 1

  const sent: string[] = []
  const failed: { to: string; error: string }[] = []

  if (msg.from_platform) {
    const { data: people } = t.recipient_user_ids.length
      ? await admin.from('profiles').select('id, full_name, email').in('id', t.recipient_user_ids)
      : { data: [] as { id: string; full_name: string | null; email: string }[] }
    const targets = [
      ...(people ?? []).filter((p) => p.email).map((p) => ({ to: p.email, name: firstName(p.full_name), member: true })),
      ...(t.extra_emails as string[]).map((e) => ({ to: e, name: '', member: false })),
    ]
    const subject = isReply ? `Re: ${t.subject}` : t.subject
    for (const x of targets) {
      const html = shell({
        heading: t.subject,
        greeting: x.name ? `Hello ${x.name},` : 'Hello,',
        body: paragraphs(msg.body),
        button: x.member ? { label: 'Reply in The Counsel', href: `${SITE_URL}/support/${t.id}` } : undefined,
        footer: x.member
          ? `Sent to you by The Counsel about ${esc(org?.name ?? 'your firm')}'s workspace. You can reply in The Counsel, or simply reply to this email.`
          : `Sent to you by The Counsel about ${esc(org?.name ?? 'your firm')}. Simply reply to this email to answer.`,
      })
      const r = await sendEmail({ to: x.to, subject, html, replyTo: author?.email })
      if (r.ok) sent.push(x.to); else failed.push({ to: x.to, error: r.error ?? 'failed' })
    }
  } else {
    const ids = [...new Set([t.created_by, t.assignee_id].filter(Boolean))] as string[]
    const { data: staff } = ids.length ? await admin.from('profiles').select('email, full_name').in('id', ids) : { data: [] }
    const who = author?.full_name ?? author?.email ?? 'Someone'
    for (const s of staff ?? []) {
      if (!s.email) continue
      const html = shell({
        heading: `${who} replied: ${t.subject}`,
        greeting: `Hello ${firstName(s.full_name) || 'there'},`,
        body: `<p style="margin:0 0 14px;color:${MUTED}">${esc(who)} from ${esc(org?.name ?? 'a firm')} wrote:</p>${paragraphs(msg.body)}`,
        button: { label: 'Open the conversation', href: `${SITE_URL}/platform/conversations/${t.id}` },
        footer: 'You are getting this because you started this conversation in the Platform Console.',
      })
      const r = await sendEmail({ to: s.email, subject: `Re: ${t.subject} — ${org?.name ?? ''}`.trim(), html, replyTo: author?.email })
      if (r.ok) sent.push(s.email); else failed.push({ to: s.email, error: r.error ?? 'failed' })
    }
  }

  if (sent.length > 0) await admin.from('support_ticket_messages').update({ emailed_at: new Date().toISOString() }).eq('id', msg.id)
  return json({ ok: failed.length === 0, sent, failed })
})
