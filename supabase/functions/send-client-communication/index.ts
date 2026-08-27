// ============================================================================
// Edge Function: send-client-communication
// The only place a client_communications row actually gets emailed. Mirrors
// send-task-notification's posture exactly: honest FAILED with a real
// reason when Resend isn't configured or the send fails, never a faked
// SENT, and every call updates the matching row's status/sent_at/
// failure_reason so it's never left PENDING forever.
//
// Deploy:  supabase functions deploy send-client-communication --no-verify-jwt
//   (service-role bearer token from the client, same as send-task-notification —
//   the caller already passed clients.communicate + client/matter access via
//   client_communications' own insert RLS policy at row-creation time; this
//   function's job is only to deliver and record the outcome.)
// Secrets: reuses RESEND_API_KEY / RESEND_FROM_EMAIL, already set for
//          send-task-notification.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const GOLD = '#B38A3E'
const INK = '#1c1917'
const MUTED = '#78716c'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

// User-composed body is plain text (the composer is a plain textarea, not a
// rich editor) — escaped, then newlines turned into <br> so paragraphs
// survive in the HTML email without needing any markup from the sender.
function bodyHtml(body: string): string {
  return esc(body).replace(/\n/g, '<br>')
}

function emailShell(firmName: string, subject: string, html: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:${INK}">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #e7e5e4">
        <span style="color:${GOLD};font-weight:700;font-size:18px">${esc(firmName)}</span>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 16px;font-size:18px">${esc(subject)}</h1>
        <div style="font-size:14px;line-height:1.6;color:${INK}">${html}</div>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#fafaf9;color:${MUTED};font-size:12px">
        This message was sent to you regarding your matter with ${esc(firmName)}.
      </td></tr>
    </table>
    </td></tr></table>
  </body></html>`
}

async function sendEmail(params: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return { ok: false, error: 'Email is not configured.' }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Counsel <notifications@thecounsels.org>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [params.to], subject: params.subject, html: params.html }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `Resend error (${res.status}): ${body.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Email send failed' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  let body: { communicationId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const id = body.communicationId
  if (!id) return json({ error: 'communicationId is required' }, 400)

  const { data: comm } = await admin.from('client_communications').select('*').eq('id', id).maybeSingle()
  if (!comm) return json({ error: 'Communication not found' }, 404)

  // Idempotency guard — a retried/duplicate call is a no-op once resolved.
  if (comm.status !== 'PENDING') return json({ ok: true, skipped: true })

  const fail = async (reason: string) => {
    await admin.from('client_communications').update({ status: 'FAILED', failure_reason: reason }).eq('id', id)
    return json({ ok: false, error: reason })
  }

  if (!comm.recipient_email) return fail('No recipient email on file.')

  const { data: org } = await admin.from('organizations').select('name').eq('id', comm.organization_id).maybeSingle()
  const firmName = org?.name ?? 'The Counsel'

  const html = emailShell(firmName, comm.subject, bodyHtml(comm.body))
  const result = await sendEmail({ to: comm.recipient_email, subject: comm.subject, html })
  if (!result.ok) return fail(result.error ?? 'Email send failed')

  await admin.from('client_communications').update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', id)
  return json({ ok: true })
})
