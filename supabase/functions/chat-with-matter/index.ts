// ============================================================================
// Edge Function: chat-with-matter
// Conversational follow-up on a matter, building on summarize-matter's
// one-shot summary — same Gemini setup, same matter/tasks/hearings
// grounding logic, but multi-turn and persisted per (matter, user) in
// matter_ai_chat_messages. Business/Enterprise plans only (ai_summarization
// — this is "more AI on a matter," not a separate capability tier),
// enforced HERE server-side, same posture as summarize-matter.
//
// No client-direct writes to matter_ai_chat_messages at all (see its own
// migration, 0102) — this function is the only writer, for both the
// user's message and the AI's reply, inserted together in one call.
//
// Deploy:  supabase functions deploy chat-with-matter
//   (no --no-verify-jwt — this is called directly from the browser with
//   the signed-in user's own session, same as summarize-matter; unlike
//   send-task-notification, which pg_net calls with a service-role token.)
// Secrets: none new — GEMINI_API_KEY is already project-scoped from
//   summarize-matter's setup, resolves automatically here too.
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

// See summarize-matter/index.ts's own comment for why this is the
// "-latest" alias rather than a pinned dated model string (two prior
// outages from Google retiring a dated model for new users).
const GEMINI_MODEL = 'gemini-flash-latest'
const MAX_TOKENS = 1536
const HISTORY_LIMIT = 20

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  let body: { matterId?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const { matterId } = body
  const message = body.message?.trim()
  if (!matterId) return json({ error: 'matterId is required' }, 400)
  if (!message) return json({ error: 'message is required' }, 400)

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
  if (matterErr) console.error('Matter lookup failed in chat-with-matter:', matterErr)
  if (matterErr || !matter) return json({ error: 'Matter not found, or you do not have access to it' }, 404)

  if (matter.status === 'closed' || matter.status === 'won' || matter.status === 'lost') {
    return json({ error: 'This matter is closed — AI chat is read-only. Historical messages still show.' }, 403)
  }

  if (!GEMINI_API_KEY) return json({ error: 'AI chat is not configured yet — contact support.' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })

  // Server-side plan enforcement — the actual gate, not the frontend's own
  // (which only controls visibility). Uses org_has_feature() (0100), the
  // current convention — summarize-matter still hand-rolls the equivalent
  // subscriptions->plans.features lookup inline; both check the same key.
  const { data: hasFeature } = await admin.rpc('org_has_feature', { p_org: matter.organization_id, p_feature: 'ai_summarization' })
  if (!hasFeature) {
    return json({ error: 'AI chat is available on the Business plan and above. Upgrade to use it.' }, 403)
  }

  const [{ data: tasks }, { data: hearings }, { data: history }] = await Promise.all([
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
    admin
      .from('matter_ai_chat_messages')
      .select('role, content, created_at')
      .eq('matter_id', matterId)
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
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

  const systemInstruction = [
    'You are a legal practice assistant answering questions about a specific matter for the lawyer working on it.',
    'Plain text only — this is displayed as-is with no markdown rendering. No **bold**, no # headings, no * or - bullet symbols.',
    'Be factual and concise. Only use the matter details below and the conversation so far — do not invent facts.',
    '',
    lines.join('\n'),
  ].join('\n')

  // History was fetched newest-first (for the LIMIT to keep the most
  // recent turns); Gemini needs it oldest-first.
  const orderedHistory = (history ?? []).slice().reverse()
  const contents = [
    ...orderedHistory.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: message }] },
  ]

  const aiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
      }),
    },
  )

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => '')
    console.error('Gemini API error:', aiRes.status, errText)
    return json({ error: 'Could not get a reply right now. Please try again.' }, 502)
  }

  const aiData = await aiRes.json()
  const parts: { text?: string }[] = aiData.candidates?.[0]?.content?.parts ?? []
  const reply: string = parts.map((p) => p.text ?? '').join('').trim()
  if (!reply) return json({ error: 'The AI did not return a reply. Please try again.' }, 502)

  const { error: insertErr } = await admin.from('matter_ai_chat_messages').insert([
    { organization_id: matter.organization_id, matter_id: matterId, user_id: userData.user.id, role: 'user', content: message },
    { organization_id: matter.organization_id, matter_id: matterId, user_id: userData.user.id, role: 'assistant', content: reply },
  ])
  if (insertErr) console.error('Could not save chat messages:', insertErr)

  return json({ reply })
})
