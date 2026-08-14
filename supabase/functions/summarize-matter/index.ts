// ============================================================================
// Edge Function: summarize-matter
// Generates an AI summary of a matter (status, client, key dates, open
// tasks, hearings) via Google's Gemini API — chosen specifically because
// its free tier requires no billing/credit card to start (Anthropic and
// OpenAI both require a funded account, even at low volume). Business/
// Enterprise plans only — enforced HERE, server-side, via the service-role
// client reading the org's actual plan; the frontend's own gate only
// controls what's *shown*, same principle as every other access check in
// this app (never trust the client).
//
// Deploy:  supabase functions deploy summarize-matter
// Secrets: supabase secrets set GEMINI_API_KEY=...
//   Get a free key at https://aistudio.google.com/apikey — no card needed.
//   Free tier is rate-limited (requests/minute and /day); if generation
//   starts failing under real load, that's the first thing to check.
// If GEMINI_MODEL below is ever deprecated/renamed, update it to whatever
// aistudio.google.com currently lists as its free-tier flash model.
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

// gemini-2.0-flash was retired (confirmed via a live 404 from Google's API,
// pointing at their "Interactions API" migration guide) — 2.5-flash is the
// current stable "price-performance workhorse" tier per ai.google.dev/
// gemini-api/docs/models as of Aug 2026, the positioning Google has
// historically kept on the free tier (unlike a brand-new flagship release,
// which sometimes launches paid-only before free-tier access follows). If
// this one also gets retired, the error log will say so exactly the same
// way — check aistudio.google.com's current model list and swap this string.
const GEMINI_MODEL = 'gemini-2.5-flash'
const MAX_TOKENS = 700

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  let body: { matterId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { matterId } = body
  if (!matterId) return json({ error: 'matterId is required' }, 400)

  // Caller-scoped client — RLS does the real access check. If this can read
  // the matter at all, the caller is genuinely allowed to see it; no
  // separate permission RPC needed.
  const caller = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await caller.auth.getUser()
  if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401)

  const { data: matter, error: matterErr } = await caller
    .from('matters')
    .select('id, organization_id, title, description, status, practice_area, court, judge, opposing_counsel, priority, opened_on, closed_on, client:clients(display_name)')
    .eq('id', matterId)
    .maybeSingle()
  // Logged so a real query failure (bad column, ambiguous embed, etc.) is
  // never indistinguishable from an actual access denial again.
  if (matterErr) console.error('Matter lookup failed in summarize-matter:', matterErr)
  if (matterErr || !matter) return json({ error: 'Matter not found, or you do not have access to it' }, 404)

  if (!GEMINI_API_KEY) return json({ error: 'AI summarization is not configured yet — contact support.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  // Server-side plan enforcement — the actual gate, not the frontend's own
  // (which only controls visibility).
  const { data: sub } = await admin
    .from('subscriptions')
    .select('plan:plans!subscriptions_plan_id_fkey(features)')
    .eq('organization_id', matter.organization_id)
    .maybeSingle()
  const features = (sub as unknown as { plan: { features: Record<string, unknown> } | null } | null)?.plan?.features
  if (!features?.ai_summarization) {
    return json({ error: 'AI summarization is available on the Business plan and above. Upgrade to use it.' }, 403)
  }

  const [{ data: tasks }, { data: hearings }] = await Promise.all([
    admin
      .from('tasks')
      .select('title, status, priority, due_date')
      .eq('matter_id', matterId)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20),
    admin
      .from('hearings')
      .select('title, hearing_at, status, court')
      .eq('matter_id', matterId)
      .order('hearing_at', { ascending: false })
      .limit(10),
  ])

  const client = (matter as unknown as { client: { display_name: string } | null }).client
  const lines = [
    `Matter: ${matter.title}`,
    matter.description ? `Description: ${matter.description}` : null,
    client?.display_name ? `Client: ${client.display_name}` : null,
    `Status: ${matter.status}${matter.priority ? ` (priority: ${matter.priority})` : ''}`,
    matter.practice_area ? `Practice area: ${matter.practice_area}` : null,
    matter.court ? `Court: ${matter.court}` : null,
    matter.judge ? `Judge/Magistrate: ${matter.judge}` : null,
    matter.opposing_counsel ? `Opposing counsel: ${matter.opposing_counsel}` : null,
    `Opened: ${matter.opened_on}${matter.closed_on ? `, Closed: ${matter.closed_on}` : ''}`,
    '',
    'Open/active tasks:',
    ...((tasks ?? []).length > 0
      ? (tasks ?? []).map((t) => `- [${t.status}${t.due_date ? `, due ${t.due_date}` : ''}] ${t.title}`)
      : ['- none']),
    '',
    'Hearings (most recent first):',
    ...((hearings ?? []).length > 0
      ? (hearings ?? []).map((h) => `- ${h.hearing_at.slice(0, 10)} — ${h.title} (${h.status}${h.court ? `, ${h.court}` : ''})`)
      : ['- none']),
  ].filter((l): l is string => l !== null)

  const prompt = [
    'You are a legal practice assistant. Summarize the following matter for a lawyer who needs a quick, accurate refresher before a call or hearing.',
    'Write 3-5 short paragraphs or a tight bulleted brief: current status, what has happened, what is outstanding/due next, and anything risky or time-sensitive.',
    'Be factual and concise. Do not invent facts not present below.',
    '',
    lines.join('\n'),
  ].join('\n')

  const aiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    },
  )

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => '')
    console.error('Gemini API error:', aiRes.status, errText)
    return json({ error: 'Could not generate a summary right now. Please try again.' }, 502)
  }

  const aiData = await aiRes.json()
  const parts: { text?: string }[] = aiData.candidates?.[0]?.content?.parts ?? []
  const summary: string = parts.map((p) => p.text ?? '').join('').trim()
  if (!summary) return json({ error: 'The AI did not return a summary. Please try again.' }, 502)

  const generatedAt = new Date().toISOString()
  await admin.from('matters').update({ ai_summary: summary, ai_summary_generated_at: generatedAt }).eq('id', matterId)
  await admin.rpc('log_audit', {
    p_org: matter.organization_id,
    p_action: 'matter.ai_summary_generated',
    p_entity_type: 'matter',
    p_entity_id: matterId,
    p_summary: `AI summary generated for ${matter.title}`,
    // Same service-role-client gap as admin-create-user — pass the real
    // caller through so this doesn't show up as "Someone".
    p_actor_id: userData.user.id,
  })

  return json({ summary, generatedAt })
})
