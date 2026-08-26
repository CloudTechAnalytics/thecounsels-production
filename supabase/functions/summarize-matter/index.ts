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
// GEMINI_MODEL uses the "-latest" alias (see its own comment below) so a
// retired dated model string shouldn't cause this again — if generation
// still fails, it's most likely the API key or a rate limit, not the model.
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

// gemini-2.0-flash, then gemini-2.5-flash, were each retired for new users
// in turn (both confirmed via a live 404 from Google's API) — pinning an
// exact dated model string here has now broken this feature twice in one
// session. Switched to the "-latest" alias instead: Google hot-swaps it to
// whatever the current non-deprecated Flash model is, with a 2-week email
// notice before any breaking change — it stays on the Flash tier (the
// free-tier-friendly one this integration was chosen for) rather than ever
// silently resolving to a paid Pro model. If generation ever starts
// failing again, it's no longer "which model string is current" — check
// GEMINI_API_KEY/quota first.
const GEMINI_MODEL = 'gemini-flash-latest'
// 2.5+/3.x Flash models "think" before answering by default, and those
// reasoning tokens are drawn from this same maxOutputTokens budget — a low
// limit can get fully consumed by invisible thinking before a single
// visible token is written, producing exactly what looks like a truncated
// response cut off after a couple of words. thinkingBudget: 0 below turns
// that off (plain, fast completion, no hidden token cost); this is kept
// generous anyway as headroom for a genuine 3-5 paragraph brief.
const MAX_TOKENS = 1536
// The frontend's own Supabase client wraps every request (edge function
// invocations included) in a 20s fetch timeout (shared/lib/supabase.ts) —
// a Gemini call that runs past that gets reported to the user as a raw
// "failed to fetch", not the clear message below. Staying comfortably
// under that ceiling means an overloaded/slow Gemini (confirmed directly:
// a 503 "high demand" response that itself took over two minutes to
// arrive) fails fast with an honest reason instead of hanging until the
// client gives up first.
const GEMINI_TIMEOUT_MS = 15_000

type GeminiResult = { ok: true; res: Response } | { ok: false; reason: 'timeout' } | { ok: false; reason: 'http'; status: number; text: string }

async function callGemini(model: string, apiKey: string, requestBody: unknown): Promise<GeminiResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody), signal: controller.signal },
    )
    clearTimeout(timeoutId)
    if (!res.ok) return { ok: false, reason: 'http', status: res.status, text: await res.text().catch(() => '') }
    return { ok: true, res }
  } catch {
    clearTimeout(timeoutId)
    return { ok: false, reason: 'timeout' }
  }
}

/** 503 (overloaded) and 429 (rate-limited) both mean "temporary, try again shortly" — Google's own 503 message says so explicitly. */
function geminiFailureMessage(result: Extract<GeminiResult, { ok: false }>): string {
  if (result.reason === 'timeout') return 'AI is taking too long to respond right now — this is usually temporary. Please try again in a moment.'
  if (result.status === 503 || result.status === 429) return 'AI is experiencing high demand right now. Please try again in a moment.'
  return 'Could not generate a summary right now. Please try again.'
}

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
  // (which only controls visibility). org_has_feature() (0100) is the
  // current, shared convention — chat-with-matter uses the same call.
  const { data: hasFeature } = await admin.rpc('org_has_feature', { p_org: matter.organization_id, p_feature: 'ai_summarization' })
  if (!hasFeature) {
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
    'Write 3-5 short paragraphs: current status, what has happened, what is outstanding/due next, and anything risky or time-sensitive.',
    'Plain text only — this is displayed as-is with no markdown rendering. No **bold**, no # headings, no * or - bullet symbols. Separate points with a plain line break instead.',
    'Be factual and concise. Do not invent facts not present below.',
    '',
    lines.join('\n'),
  ].join('\n')

  const result = await callGemini(GEMINI_MODEL, GEMINI_API_KEY, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: MAX_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
  })

  if (!result.ok) {
    console.error('Gemini request failed:', result.reason === 'http' ? `${result.status} ${result.text}` : 'timeout')
    return json({ error: geminiFailureMessage(result) }, 502)
  }

  const aiData = await result.res.json()
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
