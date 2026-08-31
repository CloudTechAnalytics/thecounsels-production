// ============================================================================
// Edge Function: check-resource-usage
// Daily resource-cap watchdog — the user's real worry was hitting Supabase
// Free tier's 500MB database / 1GB storage caps with no warning, right as a
// real 25-user org onboards. Invoked exclusively by pg_cron (see the
// check_resource_usage cron job in migration 0158/0159) via pg_net, same
// posture and same real security lesson as send-task-notification: pg_net
// presents the LEGACY JWT-format service-role key (from
// vault.decrypted_secrets 'service_role_key'), which this project's edge
// runtime no longer auto-injects as SUPABASE_SERVICE_ROLE_KEY since
// migrating to the newer sb_secret_... key format — so this checks against
// PG_NET_SERVICE_KEY (an explicitly-set secret holding that legacy value)
// as well as the auto-injected one, exactly like send-task-notification.
//
// Deploy:  supabase functions deploy check-resource-usage --no-verify-jwt
// Secrets: reuses RESEND_API_KEY / RESEND_FROM_EMAIL, already set for
//          send-task-notification. Also needs PG_NET_SERVICE_KEY (already
//          set on both projects as of the send-task-notification fix).
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

async function sendEmail(to: string[], subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return { ok: false, error: 'Email is not configured.' }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Counsel <notifications@thecounsels.org>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) return { ok: false, error: `Resend error (${res.status}): ${(await res.text()).slice(0, 300)}` }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Email send failed' }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const PG_NET_KEY = Deno.env.get('PG_NET_SERVICE_KEY')

  const authHeader = req.headers.get('Authorization')
  const authorized = authHeader === `Bearer ${SERVICE_ROLE}` || (PG_NET_KEY && authHeader === `Bearer ${PG_NET_KEY}`)
  if (!authorized) return json({ error: 'Not authorized' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data, error } = await admin.rpc('internal_check_resource_alert')
  if (error) {
    console.error('internal_check_resource_alert failed:', error)
    return json({ error: error.message }, 500)
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { should_alert: boolean; message: string | null; db_pct: number; storage_pct: number }
    | undefined
  if (!result) return json({ error: 'No result from usage check' }, 500)

  if (!result.should_alert) {
    return json({ ok: true, alerted: false, db_pct: result.db_pct, storage_pct: result.storage_pct })
  }

  // Every platform admin gets the email — not just whoever set support_email
  // (which is unset today), so this never silently has nowhere to land.
  const { data: admins } = await admin.from('profiles').select('email').eq('is_platform_admin', true).not('email', 'is', null)
  const recipients = (admins ?? []).map((a) => a.email).filter((e): e is string => Boolean(e))

  if (recipients.length === 0) {
    return json({ ok: true, alerted: true, emailed: false, reason: 'No platform admin email on file', ...result })
  }

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:${INK}">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #e7e5e4">
        <span style="color:${GOLD};font-weight:700;font-size:18px">The Counsel — Platform Alert</span>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 16px;font-size:18px">Resource usage warning</h1>
        <p style="font-size:14px;line-height:1.6;color:${INK}">${esc(result.message)}</p>
        <p style="font-size:13px;line-height:1.6;color:${MUTED};margin-top:16px">
          Database: ${result.db_pct}% of cap · Storage: ${result.storage_pct}% of cap.<br>
          Check Platform Console → System Health for the live breakdown, or raise the caps in Platform Settings once you upgrade your Supabase plan.
        </p>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#fafaf9;color:${MUTED};font-size:12px">
        Automated daily check — you'll only get this again if usage climbs another 15 points, or drops back under 70% and later climbs again.
      </td></tr>
    </table>
    </td></tr></table>
  </body></html>`

  const sendResult = await sendEmail(recipients, `⚠ Resource usage at ${Math.max(result.db_pct, result.storage_pct)}% of cap`, html)
  return json({ ok: true, alerted: true, emailed: sendResult.ok, emailError: sendResult.error, recipients: recipients.length, ...result })
})
