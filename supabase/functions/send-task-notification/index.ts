// ============================================================================
// Edge Function: send-task-notification
// The ONLY place a task-related email or WhatsApp message is actually sent.
// Invoked two ways, both passing the same { notification_log_id }: directly
// via invokeEdgeFunction() for a synchronous send, and via pg_net.http_post
// from the database (dispatch_task_notification / run_task_reminders,
// migrations 0058/0059) for scheduler-driven reminders. Either way this
// function is the single source of truth for what actually got sent — every
// call updates the matching notification_log row's status/sent_at/
// failure_reason, never leaving it PENDING forever and never faking SENT.
//
// Deploy:  supabase functions deploy send-task-notification --no-verify-jwt
//   (--no-verify-jwt because pg_net calls this with a service-role bearer
//   token, not an end-user JWT — the service-role check inside this
//   function is what actually gates access, same posture as paystack-webhook.)
// Secrets: supabase secrets set RESEND_API_KEY=re_...
//          supabase secrets set RESEND_FROM_EMAIL="The Counsel <notifications@yourdomain>"
//          supabase secrets set SITE_URL=https://your-deployed-app-domain
//          optionally: supabase secrets set WHATSAPP_PROVIDER=meta|twilio (unset = no-op)
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const GOLD = '#B38A3E'
const INK = '#1c1917'
const MUTED = '#78716c'
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://thecounsel.app'

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function priorityBadge(priority: string): string {
  const colors: Record<string, [string, string]> = {
    urgent: ['#fee2e2', '#b91c1c'],
    high: ['#fef3c7', '#92400e'],
    medium: ['#f5f5f4', '#57534e'],
    low: ['#f5f5f4', '#78716c'],
  }
  const [bg, fg] = colors[priority] ?? colors.medium
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:600;text-transform:uppercase">${esc(priority)}</span>`
}

interface TaskContext {
  title: string
  priority: string
  dueDate: string | null
  matterTitle: string | null
  clientName: string | null
  assignedByName: string | null
  link: string
}

function detailsBlock(t: TaskContext): string {
  return `
    <table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:${MUTED};white-space:nowrap">Task</td><td style="padding:4px 0;font-weight:600">${esc(t.title)}</td></tr>
      ${t.matterTitle ? `<tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Matter</td><td style="padding:4px 0">${esc(t.matterTitle)}</td></tr>` : ''}
      ${t.clientName ? `<tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Client</td><td style="padding:4px 0">${esc(t.clientName)}</td></tr>` : ''}
      <tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Priority</td><td style="padding:4px 0">${priorityBadge(t.priority)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Due date</td><td style="padding:4px 0">${esc(fmtDate(t.dueDate))}</td></tr>
      ${t.assignedByName ? `<tr><td style="padding:4px 12px 4px 0;color:${MUTED}">Assigned by</td><td style="padding:4px 0">${esc(t.assignedByName)}</td></tr>` : ''}
    </table>
    <a href="${t.link}" style="display:inline-block;margin-top:8px;padding:10px 22px;background:${GOLD};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open task</a>
  `
}

function emailShell(heading: string, intro: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:${INK}">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:100%">
      <tr><td style="padding:24px 32px;border-bottom:1px solid #e7e5e4">
        <span style="color:${GOLD};font-weight:700;font-size:18px">The Counsel</span>
      </td></tr>
      <tr><td style="padding:32px">
        <h1 style="margin:0 0 8px;font-size:19px">${esc(heading)}</h1>
        <p style="margin:0 0 4px;color:${MUTED};font-size:14px">${esc(intro)}</p>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 32px;background:#fafaf9;color:${MUTED};font-size:12px">
        You're receiving this because task notifications are enabled for your account in The Counsel.
        Manage this under Notifications → Preferences.
      </td></tr>
    </table>
    </td></tr></table>
  </body></html>`
}

function buildEmail(type: string, t: TaskContext): { subject: string; html: string } {
  switch (type) {
    case 'task_assigned':
      return {
        subject: `New task assigned: ${t.title}`,
        html: emailShell("You've been assigned a task", 'A new task needs your attention.', detailsBlock(t)),
      }
    case 'task_reassigned':
      return {
        subject: `Task reassigned to you: ${t.title}`,
        html: emailShell("You've been assigned a task", 'This task was reassigned to you.', detailsBlock(t)),
      }
    case 'task_due_24h':
      return {
        subject: `Due tomorrow: ${t.title}`,
        html: emailShell('Task due in 24 hours', 'This task is due soon — here are the details.', detailsBlock(t)),
      }
    case 'task_due_1h':
      return {
        subject: `Due in 1 hour: ${t.title}`,
        html: emailShell('Task due in 1 hour', "This task is due very soon — don't miss it.", detailsBlock(t)),
      }
    case 'task_overdue':
      return {
        subject: `Overdue: ${t.title}`,
        html: emailShell('Task overdue', 'This task has passed its due date and needs attention.', detailsBlock(t)),
      }
    case 'task_completed':
      return {
        subject: `Task completed: ${t.title}`,
        html: emailShell('Task completed', 'A task you created has been marked complete.', detailsBlock(t)),
      }
    default:
      return { subject: t.title, html: emailShell(t.title, '', detailsBlock(t)) }
  }
}

function buildWhatsAppMessage(type: string, t: TaskContext): string {
  const base = `${t.title}${t.matterTitle ? ` (${t.matterTitle})` : ''} — Priority: ${t.priority}. Due: ${fmtDate(t.dueDate)}.`
  switch (type) {
    case 'task_assigned': return `📋 New task assigned: ${base} ${t.link}`
    case 'task_reassigned': return `📋 Task reassigned to you: ${base} ${t.link}`
    case 'task_due_24h': return `⏰ Due tomorrow: ${base} ${t.link}`
    case 'task_due_1h': return `⏰ Due in 1 hour: ${base} ${t.link}`
    case 'task_overdue': return `🔴 Overdue: ${base} ${t.link}`
    case 'task_completed': return `✅ Task completed: ${base} ${t.link}`
    default: return `${base} ${t.link}`
  }
}

// ----------------------------------------------------------------------------
// Email — Resend REST API. Honest "not configured" FAILED state when the
// secret is unset, same posture as paystack-init-transaction for payments.
// ----------------------------------------------------------------------------
async function sendEmailNotification(params: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) return { ok: false, error: 'Email is not configured.' }
  const from = Deno.env.get('RESEND_FROM_EMAIL') ?? 'The Counsel <notifications@thecounsel.app>'
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

// ----------------------------------------------------------------------------
// WhatsApp — provider-agnostic interface (spec §8: "DO NOT hard-code a
// WhatsApp provider"). No vendor is wired in; NoopWhatsAppProvider is the
// honest default until WHATSAPP_PROVIDER + its own secrets are configured.
// Real providers (Meta Cloud API, Twilio, …) plug in later by implementing
// this same interface — nothing else in this file or the Task UI changes.
// ----------------------------------------------------------------------------
interface WhatsAppProvider {
  send(to: string, message: string): Promise<{ ok: boolean; providerId?: string; error?: string }>
}

class NoopWhatsAppProvider implements WhatsAppProvider {
  async send(): Promise<{ ok: boolean; error?: string }> {
    return { ok: false, error: 'WhatsApp is not configured.' }
  }
}

function getWhatsAppProvider(): WhatsAppProvider {
  const provider = Deno.env.get('WHATSAPP_PROVIDER')
  // Real providers register here once credentials exist, e.g.:
  //   if (provider === 'meta') return new MetaCloudApiProvider(...)
  //   if (provider === 'twilio') return new TwilioWhatsAppProvider(...)
  void provider
  return new NoopWhatsAppProvider()
}

async function sendWhatsAppNotification(params: { to: string; message: string }): Promise<{ ok: boolean; error?: string }> {
  const provider = getWhatsAppProvider()
  return provider.send(params.to, params.message)
}

// ----------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  let body: { notification_log_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const logId = body.notification_log_id
  if (!logId) return json({ error: 'notification_log_id is required' }, 400)

  const { data: log } = await admin.from('notification_log').select('*').eq('id', logId).maybeSingle()
  if (!log) return json({ error: 'Notification log entry not found' }, 404)

  // Idempotency guard — a retried/duplicate call for the same log row is a
  // no-op once it's already been resolved (spec §15: duplicate execution
  // must not double-send).
  if (log.status !== 'PENDING') return json({ ok: true, skipped: true })

  const fail = async (reason: string) => {
    await admin.from('notification_log').update({ status: 'FAILED', failure_reason: reason }).eq('id', logId)
    return json({ ok: false, error: reason })
  }

  const [{ data: recipient }, { data: prefs }, { data: task }] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, phone').eq('id', log.user_id).maybeSingle(),
    admin.from('notification_preferences').select('whatsapp_number').eq('user_id', log.user_id).maybeSingle(),
    log.task_id
      ? admin.from('tasks').select('id, title, priority, due_date, matter_id').eq('id', log.task_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!recipient) return fail('Recipient profile not found.')
  if (!task) return fail('Task not found — it may have been deleted.')

  let matterTitle: string | null = null
  let clientName: string | null = null
  if (task.matter_id) {
    const { data: matter } = await admin.from('matters').select('title, client_id').eq('id', task.matter_id).maybeSingle()
    matterTitle = matter?.title ?? null
    if (matter?.client_id) {
      const { data: client } = await admin.from('clients').select('display_name').eq('id', matter.client_id).maybeSingle()
      clientName = client?.display_name ?? null
    }
  }

  let assignedByName: string | null = null
  if (log.actor_id) {
    const { data: actor } = await admin.from('profiles').select('full_name').eq('id', log.actor_id).maybeSingle()
    assignedByName = actor?.full_name ?? null
  }

  const ctx: TaskContext = {
    title: task.title,
    priority: task.priority,
    dueDate: task.due_date,
    matterTitle,
    clientName,
    assignedByName,
    link: task.matter_id ? `${SITE_URL}/matters/${task.matter_id}` : `${SITE_URL}/tasks`,
  }

  if (log.channel === 'EMAIL') {
    if (!recipient.email) return fail('Recipient has no email on file.')
    const { subject, html } = buildEmail(log.notification_type, ctx)
    const result = await sendEmailNotification({ to: recipient.email, subject, html })
    if (!result.ok) return fail(result.error ?? 'Email send failed')
    await admin.from('notification_log').update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', logId)
    return json({ ok: true })
  }

  if (log.channel === 'WHATSAPP') {
    const to = prefs?.whatsapp_number
    if (!to) return fail('No WhatsApp number on file.')
    const message = buildWhatsAppMessage(log.notification_type, ctx)
    const result = await sendWhatsAppNotification({ to, message })
    if (!result.ok) return fail(result.error ?? 'WhatsApp send failed')
    await admin.from('notification_log').update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', logId)
    return json({ ok: true })
  }

  return fail(`Unsupported channel: ${log.channel}`)
})
