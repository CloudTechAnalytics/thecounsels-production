// ============================================================================
// Edge Function: send-client-communication
// The only place a client_communications row actually gets emailed. Mirrors
// send-task-notification's posture exactly: honest FAILED with a real
// reason when Resend isn't configured or the send fails, never a faked
// SENT, and every call updates the matching row's status/sent_at/
// failure_reason so it's never left PENDING forever.
//
// Deploy:  supabase functions deploy send-client-communication --no-verify-jwt
//   (called directly from the browser with the signed-in user's own JWT —
//   see clients.service.ts's invokeEdgeFunction() call.)
// Secrets: reuses RESEND_API_KEY / RESEND_FROM_EMAIL, already set for
//          send-task-notification.
//
// SECURITY: --no-verify-jwt only disables the *platform's* check — this
// function must do its own. A real reported gap: this used to accept any
// { communicationId } with no authentication at all — the reasoning had
// been "the insert RLS policy already gated who could CREATE a pending row,
// so by the time this runs it must be legitimate," but that only covers
// who could CREATE the row, not who's allowed to trigger SENDING it later,
// and this function is reachable directly from the internet. Fixed below
// with the same pattern chat-with-matter/summarize-matter/ask-assistant
// already use correctly: validate the caller's JWT, then read the row
// through a CALLER-scoped client — if RLS lets them see it, they're
// authorized (client_communications_select is transitively gated by
// clients_select's has_permission(organization_id, 'clients.view')); only
// then does the actual send switch to the service-role client.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

// This function is called directly from the browser (supabase.functions.
// invoke, in clients.service.ts) — unlike send-task-notification (only
// ever called server-side via pg_net), it needs real CORS handling or the
// browser blocks it before any response is even parsed. Missing this was
// a real bug: every send failed with a bare "Failed to fetch"/"Could not
// fetch" and the row it inserted was stuck PENDING forever, since the
// function was never actually reached to flip its status. Matches every
// other browser-invoked function in this project (paystack-init-
// transaction, generate-data-export, admin-create-user).
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

async function sendEmail(params: { to: string; cc?: string[]; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return { ok: false, error: 'Email is not configured.' }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Counsel <notifications@thecounsels.org>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [params.to],
        ...(params.cc && params.cc.length > 0 ? { cc: params.cc } : {}),
        subject: params.subject,
        html: params.html,
      }),
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Not authenticated' }, 401)

  let body: { communicationId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const id = body.communicationId
  if (!id) return json({ error: 'communicationId is required' }, 400)

  // Caller-scoped client — RLS does the real access check. If this can read
  // the communication at all, the caller is genuinely allowed to see it
  // (client_communications_select is transitively gated by clients_select's
  // has_permission(organization_id, 'clients.view')); no separate
  // permission RPC needed. Only after this succeeds does the rest of the
  // function switch to the service-role client for the actual send.
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: visible } = await caller.from('client_communications').select('id').eq('id', id).maybeSingle()
  if (!visible) return json({ error: 'Communication not found, or you do not have access to it' }, 404)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

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

  // Copy the matter's own team on client-facing correspondence — the
  // lawyers actually working the matter should see what went out to the
  // client, not find out secondhand. lead_lawyer_id + matter_assignments
  // is the same "matter team" MatterTeamCard shows ("beyond the lead
  // lawyer, who else can access this matter"); no matter_id (a client-
  // level message) means no team to copy. The sender themself is excluded
  // — they already have their own copy of what they just sent.
  let cc: string[] = []
  if (comm.matter_id) {
    const { data: matter } = await admin.from('matters').select('lead_lawyer_id').eq('id', comm.matter_id).maybeSingle()
    const { data: assignments } = await admin.from('matter_assignments').select('user_id').eq('matter_id', comm.matter_id)
    const teamIds = new Set<string>([
      ...(matter?.lead_lawyer_id ? [matter.lead_lawyer_id] : []),
      ...(assignments ?? []).map((a) => a.user_id),
    ])
    teamIds.delete(comm.sent_by)
    if (teamIds.size > 0) {
      const { data: profiles } = await admin.from('profiles').select('email').in('id', [...teamIds])
      cc = (profiles ?? []).map((p) => p.email).filter((e): e is string => Boolean(e))
    }
  }

  const html = emailShell(firmName, comm.subject, bodyHtml(comm.body))
  const result = await sendEmail({ to: comm.recipient_email, cc, subject: comm.subject, html })
  if (!result.ok) return fail(result.error ?? 'Email send failed')

  await admin.from('client_communications').update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', id)
  return json({ ok: true })
})
